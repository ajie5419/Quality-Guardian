import type { identity_reconciliation_metrics } from '@prisma/client';

import { IdentityProjectionService } from '~/modules/master-data-identity';
import { BusinessError } from '~/utils/business-error';
import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';

import { getPassRateProjectionFreshness } from './pass-rate-projection-query.service';
import {
  PASS_RATE_FLAG_KEY,
  PassRateProjectionService,
} from './pass-rate-projection.service';

export const MASTER_DATA_IDENTITY_BASELINE_KEY =
  'QMS_MASTER_DATA_IDENTITY_BASELINE_CHECKSUM';

const CONTROL_KEY = 'historical-identity';
const logger = createModuleLogger('PassRateProjectionRollout');
const CORE_METRICS = ['TOTAL_COUNT', 'PASS_COUNT', 'PASS_RATE'] as const;

type LatestShadow = null | {
  baselineChecksum: string;
  completedAt: Date | null;
  generationId: null | string;
  metrics: identity_reconciliation_metrics[];
};

function metricDifference(
  metrics: identity_reconciliation_metrics[],
  key: string,
) {
  const metric = metrics.find((item) => item.metricKey === key);
  return metric ? Number(metric.differenceValue) : null;
}

function parseEnabled(value: null | string | undefined) {
  return (
    String(value || '')
      .trim()
      .toLowerCase() === 'true'
  );
}

function buildCoreDifferences(metrics: identity_reconciliation_metrics[]) {
  return Object.fromEntries(
    CORE_METRICS.map((key) => [key, metricDifference(metrics, key)]),
  ) as Record<(typeof CORE_METRICS)[number], null | number>;
}

function areCoreDifferencesZero(
  differences: Record<(typeof CORE_METRICS)[number], null | number>,
) {
  return CORE_METRICS.every((key) => differences[key] === 0);
}

async function getLatestShadow(): Promise<LatestShadow> {
  const run = await prisma.identity_reconciliation_runs.findFirst({
    where: { consumerKey: 'pass-rate', status: 'COMPLETED' },
    orderBy: [{ completedAt: 'desc' }, { createdAt: 'desc' }],
    include: { metrics: true },
  });
  if (!run) return null;
  return {
    baselineChecksum: run.baselineChecksum,
    completedAt: run.completedAt,
    generationId: run.projectionGenerationId,
    metrics: run.metrics,
  };
}

/**
 * A failed generation before the current generation is harmless historical
 * evidence. Only work created after the active generation was published can
 * block its rollout.
 */
async function getPostActivationBlockers(
  activeGeneration: null | {
    activatedAt: Date | null;
  },
) {
  if (!activeGeneration?.activatedAt) return [];
  return prisma.identity_projection_generations.findMany({
    where: {
      createdAt: { gte: activeGeneration.activatedAt },
      status: { in: ['BUILDING', 'FAILED'] },
    },
    select: { createdAt: true, failureReason: true, id: true, status: true },
    orderBy: { createdAt: 'desc' },
  });
}

export const PassRateProjectionRolloutService = {
  async getStatus() {
    const [setting, pointer, expectedBaselineChecksum, latestShadow] =
      await Promise.all([
        prisma.system_settings.findUnique({
          where: { key: PASS_RATE_FLAG_KEY },
          select: { value: true },
        }),
        prisma.identity_projection_generation_pointer.findUnique({
          where: { key: CONTROL_KEY },
          include: { activeGeneration: true },
        }),
        prisma.system_settings
          .findUnique({
            where: { key: MASTER_DATA_IDENTITY_BASELINE_KEY },
            select: { value: true },
          })
          .then((item) => String(item?.value || '').trim() || null),
        getLatestShadow(),
      ]);
    const activeGeneration = pointer?.activeGeneration || null;
    const [freshness, blockers] = await Promise.all([
      activeGeneration
        ? getPassRateProjectionFreshness(activeGeneration.id)
        : Promise.resolve(null),
      getPostActivationBlockers(activeGeneration),
    ]);
    const differences = buildCoreDifferences(latestShadow?.metrics || []);
    const baselineMatch = Boolean(
      expectedBaselineChecksum &&
        latestShadow?.baselineChecksum === expectedBaselineChecksum,
    );
    const shadowMatchesActiveGeneration = Boolean(
      activeGeneration && latestShadow?.generationId === activeGeneration.id,
    );
    return {
      activeGeneration: activeGeneration
        ? {
            activatedAt: activeGeneration.activatedAt,
            createdAt: activeGeneration.createdAt,
            id: activeGeneration.id,
            status: activeGeneration.status,
          }
        : null,
      baselineMatch,
      enabled: parseEnabled(setting?.value),
      expectedBaselineChecksum,
      failedOrBuildingGenerations: blockers,
      freshness: freshness
        ? {
            isFresh: freshness.isFresh,
            reason: freshness.reason,
            snapshot: freshness.projectionSnapshot,
          }
        : null,
      latestShadow: latestShadow
        ? {
            baselineChecksum: latestShadow.baselineChecksum,
            completedAt: latestShadow.completedAt,
            coreDifferences: differences,
            generationId: latestShadow.generationId,
            isCurrentGeneration: shadowMatchesActiveGeneration,
          }
        : null,
      rolloutReady: Boolean(
        activeGeneration &&
          freshness?.isFresh &&
          latestShadow &&
          baselineMatch &&
          shadowMatchesActiveGeneration &&
          areCoreDifferencesZero(differences) &&
          blockers.length === 0,
      ),
    };
  },

  async setEnabled(enabled: boolean) {
    if (enabled) {
      const status = await this.getStatus();
      if (!status.rolloutReady) {
        throw new BusinessError(
          'PASS_RATE_PROJECTION_ROLLOUT_NOT_READY',
          'Pass-rate projection cannot be enabled until the current generation passes every rollout gate',
          409,
        );
      }
    }
    await prisma.system_settings.upsert({
      where: { key: PASS_RATE_FLAG_KEY },
      create: {
        key: PASS_RATE_FLAG_KEY,
        value: String(enabled),
        description: 'Pass-rate identity projection rollout flag',
      },
      update: { value: String(enabled) },
    });
    return this.getStatus();
  },

  async enqueueRebuild(params: { reason?: string; requestedById?: string }) {
    const existing = await prisma.pass_rate_projection_refresh_jobs.findFirst({
      where: {
        isDeleted: false,
        status: { in: ['PENDING', 'PROCESSING'] },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) return { enqueued: false, job: existing };
    const job = await prisma.pass_rate_projection_refresh_jobs.create({
      data: {
        reason: String(params.reason || '').trim() || null,
        requestedById: String(params.requestedById || '').trim() || null,
      },
    });
    return { enqueued: true, job };
  },

  async requestRebuild(params: { reason?: string; requestedById?: string }) {
    // Rebuilds are intentionally consumed by the dedicated worker script.
    // Running the write-heavy projection build inside the web process can
    // exhaust a small database and take authentication down with it.
    return this.enqueueRebuild(params);
  },

  async processNextRebuild() {
    const candidate = await prisma.pass_rate_projection_refresh_jobs.findFirst({
      where: {
        isDeleted: false,
        OR: [
          { status: 'PENDING' },
          { status: 'PROCESSING', leaseUntil: { lt: new Date() } },
        ],
      },
      orderBy: { createdAt: 'asc' },
    });
    if (!candidate) return null;
    const leaseUntil = new Date(Date.now() + 10 * 60 * 1000);
    const claimed = await prisma.pass_rate_projection_refresh_jobs.updateMany({
      where: {
        id: candidate.id,
        isDeleted: false,
        OR: [
          { status: 'PENDING' },
          { status: 'PROCESSING', leaseUntil: { lt: new Date() } },
        ],
      },
      data: {
        attempts: { increment: 1 },
        leaseUntil,
        status: 'PROCESSING',
      },
    });
    if (claimed.count !== 1) return null;
    try {
      const staged = await IdentityProjectionService.createStagedGeneration();
      const passRateProjection =
        await PassRateProjectionService.buildGeneration(staged.generationId);
      const publication =
        await IdentityProjectionService.publishStagedGeneration(staged);
      if (!publication.published) {
        throw new Error(
          `IDENTITY_PROJECTION_PUBLISH_FAILED:${publication.reason}`,
        );
      }
      const result = { ...staged, ...passRateProjection, ...publication };
      await prisma.pass_rate_projection_refresh_jobs.update({
        where: { id: candidate.id },
        data: {
          completedAt: new Date(),
          leaseUntil: null,
          status: 'COMPLETED',
        },
      });
      return result;
    } catch (error: unknown) {
      logger.error(error, 'Pass-rate projection rebuild failed');
      await prisma.pass_rate_projection_refresh_jobs.update({
        where: { id: candidate.id },
        data: {
          lastError: error instanceof Error ? error.message : 'Unknown error',
          leaseUntil: null,
          status: 'FAILED',
        },
      });
      return null;
    }
  },
};
