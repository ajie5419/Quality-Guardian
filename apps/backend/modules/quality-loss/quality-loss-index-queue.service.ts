import type { Prisma } from '@prisma/client';

import {
  quality_loss_index_job_status,
  quality_loss_index_source,
} from '@prisma/client';
import prisma from '~/utils/prisma';

export type QualityLossIndexSource = keyof typeof quality_loss_index_source;

export interface QualityLossIndexQueueClient {
  quality_loss_index_jobs: Pick<
    Prisma.TransactionClient['quality_loss_index_jobs'],
    'createMany'
  >;
}

export interface QualityLossIndexJobKey {
  source: QualityLossIndexSource;
  sourcePk: string;
}

export interface ClaimedQualityLossIndexJob extends QualityLossIndexJobKey {
  attempts: number;
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

function normalizedKeys(values: QualityLossIndexJobKey[]) {
  const unique = new Map<string, QualityLossIndexJobKey>();
  for (const value of values) {
    const sourcePk = String(value.sourcePk || '').trim();
    if (!sourcePk) continue;
    unique.set(`${value.source}:${sourcePk}`, { ...value, sourcePk });
  }
  return [...unique.values()];
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function retryDelay(attempts: number) {
  return Math.min(
    BASE_RETRY_DELAY_MS * 2 ** Math.max(0, attempts - 1),
    MAX_RETRY_DELAY_MS,
  );
}

function eligibleWhere(now: Date): Prisma.quality_loss_index_jobsWhereInput {
  return {
    OR: [
      {
        availableAt: { lte: now },
        status: {
          in: [
            quality_loss_index_job_status.PENDING,
            quality_loss_index_job_status.FAILED,
          ],
        },
      },
      {
        leaseUntil: { lte: now },
        status: quality_loss_index_job_status.PROCESSING,
      },
    ],
  };
}

export const QualityLossIndexQueue = {
  async enqueue(
    client: QualityLossIndexQueueClient,
    keys: QualityLossIndexJobKey[],
    reason: string,
  ) {
    const entries = normalizedKeys(keys);
    if (entries.length === 0) return { enqueued: 0 };
    const result = await client.quality_loss_index_jobs.createMany({
      data: entries.map((entry) => ({
        reason,
        source: quality_loss_index_source[entry.source],
        sourcePk: entry.sourcePk,
      })),
    });
    return { enqueued: result.count };
  },

  async claim(options: ClaimOptions): Promise<ClaimedQualityLossIndexJob[]> {
    const now = options.now ?? new Date();
    const leaseUntil = new Date(
      now.getTime() + (options.leaseMs ?? DEFAULT_LEASE_MS),
    );
    const candidates = await prisma.quality_loss_index_jobs.findMany({
      distinct: ['source', 'sourcePk'],
      where: eligibleWhere(now),
      orderBy: [{ availableAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      take: options.limit ?? DEFAULT_BATCH_SIZE,
      select: { attempts: true, source: true, sourcePk: true },
    });

    const claimed: ClaimedQualityLossIndexJob[] = [];
    for (const candidate of candidates) {
      const result = await prisma.quality_loss_index_jobs.updateMany({
        where: {
          ...eligibleWhere(now),
          source: candidate.source,
          sourcePk: candidate.sourcePk,
        },
        data: {
          attempts: { increment: 1 },
          leaseOwner: options.workerId,
          leaseUntil,
          status: quality_loss_index_job_status.PROCESSING,
        },
      });
      if (result.count > 0) {
        claimed.push({
          attempts: candidate.attempts + 1,
          jobCount: result.count,
          source: candidate.source,
          sourcePk: candidate.sourcePk,
        });
      }
    }
    return claimed;
  },

  async complete(jobs: QualityLossIndexJobKey[], workerId: string) {
    let completed = 0;
    for (const job of normalizedKeys(jobs)) {
      const result = await prisma.quality_loss_index_jobs.updateMany({
        where: {
          leaseOwner: workerId,
          source: job.source,
          sourcePk: job.sourcePk,
          status: quality_loss_index_job_status.PROCESSING,
        },
        data: {
          completedAt: new Date(),
          lastError: null,
          leaseOwner: null,
          leaseUntil: null,
          status: quality_loss_index_job_status.COMPLETED,
        },
      });
      completed += result.count;
    }
    return { completed };
  },

  async fail(
    jobs: ClaimedQualityLossIndexJob[],
    workerId: string,
    error: unknown,
    now = new Date(),
  ) {
    let failed = 0;
    for (const job of jobs) {
      const result = await prisma.quality_loss_index_jobs.updateMany({
        where: {
          leaseOwner: workerId,
          source: job.source,
          sourcePk: job.sourcePk,
          status: quality_loss_index_job_status.PROCESSING,
        },
        data: {
          availableAt: new Date(now.getTime() + retryDelay(job.attempts)),
          lastError: errorMessage(error),
          leaseOwner: null,
          leaseUntil: null,
          status: quality_loss_index_job_status.FAILED,
        },
      });
      failed += result.count;
    }
    return { failed };
  },
};
