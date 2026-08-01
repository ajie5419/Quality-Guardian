import type {
  historical_identity_resolution_state,
  Prisma,
} from '@prisma/client';

import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';

import { getPassRateProjectionFreshness } from './pass-rate-projection-query.service';

const PASS_RATE_FLAG_KEY = 'QMS_PASS_RATE_IDENTITY_PROJECTION_ENABLED';
const IDENTITY_PROJECTION_CONTROL_KEY = 'historical-identity';
const logger = createModuleLogger('PassRateProjectionService');

type IdentityDecision = {
  canonicalId: null | string;
  entityId: string;
  entityType: string;
  fieldName: string;
  id: string;
  state: historical_identity_resolution_state;
};

function identityKey(entityId: string) {
  return `inspections:${entityId}:processId`;
}

function resolveFallbackState(
  rawProcessId: null | string,
  process: undefined | { isDeleted: boolean; status: number },
) {
  if (!rawProcessId) {
    return { effectiveProcessId: null, state: 'UNRESOLVED' as const };
  }
  if (!process) {
    return { effectiveProcessId: null, state: 'INVALID_ID' as const };
  }
  return {
    effectiveProcessId: rawProcessId,
    state:
      process.isDeleted || process.status !== 1
        ? ('RETIRED' as const)
        : ('RESOLVED' as const),
  };
}

function scheduleStaleProjectionRebuild(reason: string) {
  // This deliberately queues after the report request has already selected
  // legacy. Rebuilding inside a read path would turn a safe fallback into an
  // unbounded user-facing request.
  void import('./pass-rate-projection-rollout.service')
    .then(({ PassRateProjectionRolloutService }) =>
      PassRateProjectionRolloutService.requestRebuild({ reason }),
    )
    .catch((error: unknown) => {
      logger.error(error, 'Failed to queue stale pass-rate projection rebuild');
    });
}

async function buildRowsForGeneration(generationId: string) {
  let afterId: string | undefined;
  let written = 0;
  for (;;) {
    const inspections = await prisma.inspections.findMany({
      where: { id: afterId ? { gt: afterId } : undefined, isDeleted: false },
      orderBy: { id: 'asc' },
      take: 200,
      select: {
        category: true,
        createdAt: true,
        id: true,
        incomingType: true,
        inspectionDate: true,
        processId: true,
        qualifiedQuantity: true,
        quantity: true,
        result: true,
        updatedAt: true,
        unqualifiedQuantity: true,
      },
    });
    if (inspections.length === 0) break;
    const [decisions, processes] = await Promise.all([
      prisma.identity_resolution_projection.findMany({
        where: {
          entityId: { in: inspections.map((item) => item.id) },
          entityType: 'inspections',
          fieldName: 'processId',
          generationId,
        },
        select: {
          effectiveCanonicalId: true,
          entityId: true,
          resolutionId: true,
          state: true,
        },
      }),
      prisma.processes.findMany({
        where: {
          id: {
            in: inspections.map((item) => item.processId).filter(Boolean),
          },
        },
        select: { id: true, isDeleted: true, status: true },
      }),
    ]);
    const decisionByInspection = new Map(
      decisions.map((item) => [identityKey(item.entityId), item]),
    );
    const processById = new Map(processes.map((item) => [item.id, item]));
    const rows = inspections.map((item) => {
      const decision = decisionByInspection.get(identityKey(item.id));
      const fallback = resolveFallbackState(
        item.processId,
        item.processId ? processById.get(item.processId) : undefined,
      );
      return {
        category: item.category,
        createdAtSnapshot: item.createdAt,
        updatedAtSnapshot: item.updatedAt,
        effectiveProcessId:
          decision?.effectiveCanonicalId ?? fallback.effectiveProcessId,
        generationId,
        incomingType: item.incomingType,
        inspectionDate: item.inspectionDate,
        inspectionId: item.id,
        qualifiedQuantity: item.qualifiedQuantity,
        quantity: item.quantity,
        resolutionId: decision?.resolutionId || null,
        result: item.result,
        state: decision?.state ?? fallback.state,
        unqualifiedQuantity: item.unqualifiedQuantity,
      };
    });
    await prisma.pass_rate_process_identity_projection.createMany({
      data: rows,
    });
    written += rows.length;
    afterId = inspections.at(-1)?.id;
    if (inspections.length < 200) break;
  }
  return written;
}

/**
 * This consumer-specific projection is built before the generic pointer moves.
 * Reports read a complete generation or the previous one, never an intermediate
 * collection of generic sidecar rows.
 */
export const PassRateProjectionService = {
  async isEnabled() {
    try {
      const setting = await prisma.system_settings.findUnique({
        where: { key: PASS_RATE_FLAG_KEY },
        select: { value: true },
      });
      return (
        String(setting?.value || '')
          .trim()
          .toLowerCase() === 'true'
      );
    } catch (error: unknown) {
      logger.error(error, 'Failed to read pass-rate projection feature flag');
      return false;
    }
  },

  /**
   * A generation is only readable while it exactly represents the active fact
   * set. New records, edits and soft deletes otherwise fall back to legacy
   * rather than exposing a stale projection while the next rebuild is pending.
   */
  async getReadableGeneration() {
    if (!(await this.isEnabled())) return null;
    try {
      const pointer =
        await prisma.identity_projection_generation_pointer.findUnique({
          where: { key: IDENTITY_PROJECTION_CONTROL_KEY },
          select: { activeGenerationId: true },
        });
      if (!pointer?.activeGenerationId) return null;
      const freshness = await getPassRateProjectionFreshness(
        pointer.activeGenerationId,
      );
      if (!freshness.isFresh) {
        logger.warn(
          {
            generationId: pointer.activeGenerationId,
            reason: freshness.reason,
          },
          'Pass-rate projection is stale; using legacy report',
        );
        scheduleStaleProjectionRebuild(
          freshness.reason || 'PASS_RATE_PROJECTION_STALE',
        );
        return null;
      }
      return {
        activeGenerationId: pointer.activeGenerationId,
        snapshot: freshness.projectionSnapshot,
      };
    } catch (error: unknown) {
      logger.error(error, 'Failed to validate pass-rate projection freshness');
      scheduleStaleProjectionRebuild('PASS_RATE_PROJECTION_FRESHNESS_FAILED');
      return null;
    }
  },

  async buildGeneration(generationId: string) {
    const generation = await prisma.identity_projection_generations.findUnique({
      where: { id: generationId },
      select: { status: true },
    });
    if (generation?.status !== 'BUILDING') {
      throw new Error('PASS_RATE_PROJECTION_GENERATION_NOT_BUILDING');
    }
    await prisma.pass_rate_process_identity_projection.deleteMany({
      where: { generationId },
    });
    return {
      generationId,
      written: await buildRowsForGeneration(generationId),
    };
  },

  async syncDecision(
    client: Prisma.TransactionClient,
    decision: IdentityDecision,
  ) {
    if (
      decision.entityType !== 'inspections' ||
      decision.fieldName !== 'processId'
    ) {
      return null;
    }
    const control =
      await client.identity_projection_generation_pointer.findUnique({
        where: { key: IDENTITY_PROJECTION_CONTROL_KEY },
        select: { activeGenerationId: true },
      });
    const generationId = control?.activeGenerationId || null;
    if (!generationId) return null;
    const inspection = await client.inspections.findFirst({
      where: { id: decision.entityId, isDeleted: false },
      select: {
        category: true,
        createdAt: true,
        id: true,
        incomingType: true,
        inspectionDate: true,
        qualifiedQuantity: true,
        quantity: true,
        result: true,
        updatedAt: true,
        unqualifiedQuantity: true,
      },
    });
    if (!inspection) return null;
    return client.pass_rate_process_identity_projection.upsert({
      where: {
        generationId_inspectionId: {
          generationId,
          inspectionId: inspection.id,
        },
      },
      create: {
        category: inspection.category,
        createdAtSnapshot: inspection.createdAt,
        updatedAtSnapshot: inspection.updatedAt,
        effectiveProcessId: decision.canonicalId,
        generationId,
        incomingType: inspection.incomingType,
        inspectionDate: inspection.inspectionDate,
        inspectionId: inspection.id,
        qualifiedQuantity: inspection.qualifiedQuantity,
        quantity: inspection.quantity,
        resolutionId: decision.id,
        result: inspection.result,
        state: decision.state,
        unqualifiedQuantity: inspection.unqualifiedQuantity,
      },
      update: {
        effectiveProcessId: decision.canonicalId,
        resolutionId: decision.id,
        state: decision.state,
        updatedAtSnapshot: inspection.updatedAt,
      },
    });
  },
};

export { PASS_RATE_FLAG_KEY };
