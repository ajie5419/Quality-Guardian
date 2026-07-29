import type { Prisma } from '@prisma/client';

import { metric_refresh_status, metric_refresh_type } from '@prisma/client';
import prisma from '~/utils/prisma';

export interface MetricRefreshClient {
  metric_refresh_jobs: Pick<
    Prisma.TransactionClient['metric_refresh_jobs'],
    'createMany'
  >;
}

export interface SupplierIdentityMetricRefreshClient
  extends MetricRefreshClient {
  supplier_identity_links: Pick<
    Prisma.TransactionClient['supplier_identity_links'],
    'findMany'
  >;
}

export interface ClaimedMetricRefreshJob {
  attempts: number;
  entityId: string;
  jobCount: number;
}

interface ClaimOptions {
  leaseMs?: number;
  limit?: number;
  now?: Date;
  workerId: string;
}

const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_LEASE_MS = 5 * 60 * 1000;
const BASE_RETRY_DELAY_MS = 5000;
const MAX_RETRY_DELAY_MS = 300_000;

function uniqueIds(values: Array<null | string | undefined>) {
  return [
    ...new Set(
      values.map((value) => String(value || '').trim()).filter(Boolean),
    ),
  ];
}

function retryDelay(attempts: number) {
  return Math.min(
    BASE_RETRY_DELAY_MS * 2 ** Math.max(0, attempts - 1),
    MAX_RETRY_DELAY_MS,
  );
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

export const MetricRefreshQueue = {
  async enqueueSupplierScores(
    client: MetricRefreshClient,
    supplierIds: Array<null | string | undefined>,
    reason: string,
  ) {
    const entityIds = uniqueIds(supplierIds);
    if (entityIds.length === 0) return { enqueued: 0 };

    const result = await client.metric_refresh_jobs.createMany({
      data: entityIds.map((entityId) => ({
        entityId,
        metricType: metric_refresh_type.SUPPLIER_SCORE,
        reason,
      })),
    });
    return { enqueued: result.count };
  },

  async enqueueSupplierScoresForInspectionIdentities(
    client: SupplierIdentityMetricRefreshClient,
    identities: {
      supplierIds?: Array<null | string | undefined>;
      teamIds?: Array<null | string | undefined>;
    },
    reason: string,
  ) {
    const teamIds = uniqueIds(identities.teamIds ?? []);
    const links =
      teamIds.length === 0
        ? []
        : await client.supplier_identity_links.findMany({
            select: { supplierId: true },
            where: {
              identityId: { in: teamIds },
              identityType: 'TEAM',
              isDeleted: false,
            },
          });
    return this.enqueueSupplierScores(
      client,
      [
        ...(identities.supplierIds ?? []),
        ...links.map((link) => link.supplierId),
      ],
      reason,
    );
  },

  async claimSupplierScoreJobs(
    options: ClaimOptions,
  ): Promise<ClaimedMetricRefreshJob[]> {
    const now = options.now ?? new Date();
    const leaseUntil = new Date(
      now.getTime() + (options.leaseMs ?? DEFAULT_LEASE_MS),
    );
    const candidateWhere: Prisma.metric_refresh_jobsWhereInput = {
      isDeleted: false,
      metricType: metric_refresh_type.SUPPLIER_SCORE,
      OR: [
        {
          availableAt: { lte: now },
          status: {
            in: [metric_refresh_status.PENDING, metric_refresh_status.FAILED],
          },
        },
        {
          leaseUntil: { lte: now },
          status: metric_refresh_status.PROCESSING,
        },
      ],
    };
    const candidates = await prisma.metric_refresh_jobs.findMany({
      distinct: ['entityId'],
      where: candidateWhere,
      orderBy: [{ availableAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      take: options.limit ?? DEFAULT_BATCH_SIZE,
      select: {
        attempts: true,
        entityId: true,
      },
    });

    const claimed: ClaimedMetricRefreshJob[] = [];
    for (const candidate of candidates) {
      // A metric job is a durable change signal. Claim every available signal
      // for the same supplier so one snapshot refresh absorbs all prior writes.
      const result = await prisma.metric_refresh_jobs.updateMany({
        where: {
          ...candidateWhere,
          entityId: candidate.entityId,
        },
        data: {
          attempts: { increment: 1 },
          leaseOwner: options.workerId,
          leaseUntil,
          status: metric_refresh_status.PROCESSING,
        },
      });
      if (result.count > 0) {
        claimed.push({
          attempts: candidate.attempts + 1,
          entityId: candidate.entityId,
          jobCount: result.count,
        });
      }
    }
    return claimed;
  },

  async completeSupplierScoreJobs(entityIds: string[], workerId: string) {
    const ids = uniqueIds(entityIds);
    if (ids.length === 0) return { completed: 0 };
    const result = await prisma.metric_refresh_jobs.updateMany({
      where: {
        entityId: { in: ids },
        isDeleted: false,
        metricType: metric_refresh_type.SUPPLIER_SCORE,
        leaseOwner: workerId,
        status: metric_refresh_status.PROCESSING,
      },
      data: {
        completedAt: new Date(),
        lastError: null,
        leaseOwner: null,
        leaseUntil: null,
        status: metric_refresh_status.COMPLETED,
      },
    });
    return { completed: result.count };
  },

  async failSupplierScoreJobs(
    jobs: ClaimedMetricRefreshJob[],
    workerId: string,
    error: unknown,
    now = new Date(),
  ) {
    let failed = 0;
    for (const job of jobs) {
      const result = await prisma.metric_refresh_jobs.updateMany({
        where: {
          entityId: job.entityId,
          isDeleted: false,
          metricType: metric_refresh_type.SUPPLIER_SCORE,
          leaseOwner: workerId,
          status: metric_refresh_status.PROCESSING,
        },
        data: {
          availableAt: new Date(now.getTime() + retryDelay(job.attempts)),
          lastError: errorMessage(error),
          leaseOwner: null,
          leaseUntil: null,
          status: metric_refresh_status.FAILED,
        },
      });
      failed += result.count;
    }
    return { failed };
  },

  async countOutstandingSupplierScoreJobs() {
    return prisma.metric_refresh_jobs.count({
      where: {
        isDeleted: false,
        metricType: metric_refresh_type.SUPPLIER_SCORE,
        status: { not: metric_refresh_status.COMPLETED },
      },
    });
  },

  /**
   * Release maintenance runs while application writes are stopped, so every
   * outstanding lease can be reclaimed immediately instead of waiting for a
   * crashed process lease or retry backoff to expire.
   */
  async resetOutstandingSupplierScoreJobsForMaintenance(now = new Date()) {
    const result = await prisma.metric_refresh_jobs.updateMany({
      where: {
        isDeleted: false,
        metricType: metric_refresh_type.SUPPLIER_SCORE,
        status: { not: metric_refresh_status.COMPLETED },
      },
      data: {
        availableAt: now,
        leaseOwner: null,
        leaseUntil: null,
        status: metric_refresh_status.PENDING,
      },
    });
    return { reset: result.count };
  },
};
