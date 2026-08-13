import { hostname } from 'node:os';
import process from 'node:process';

import { createId } from '@paralleldrive/cuid2';
import { createModuleLogger } from '~/utils/logger';

import { QualityLossIndexQueue } from './quality-loss-index-queue.service';
import { QualityLossIndexService } from './quality-loss-index.service';

interface DrainOptions {
  batchSize?: number;
  maxBatches?: number;
  workerId?: string;
}

const DEFAULT_MAX_BATCHES = 20;
const POLL_INTERVAL_MS = 5000;
const logger = createModuleLogger('QualityLossIndexWorker');
const processWorkerId = `${hostname()}:${process.pid}:${createId()}`;

const sourceByJobSource = {
  COMMISSIONING: 'Commissioning',
  EXTERNAL: 'External',
  INTERNAL: 'Internal',
  MANUAL: 'Manual',
} as const;

let started = false;
let running: null | Promise<{ batches: number; processed: number }> = null;

async function drain(options: DrainOptions = {}) {
  const workerId = options.workerId ?? processWorkerId;
  let batches = 0;
  let processed = 0;

  while (batches < (options.maxBatches ?? DEFAULT_MAX_BATCHES)) {
    const jobs = await QualityLossIndexQueue.claim({
      limit: options.batchSize,
      workerId,
    });
    if (jobs.length === 0) break;

    try {
      // Completed rows are idempotent upserts. If a later row fails, retrying
      // the whole claimed batch favors durable convergence over bookkeeping.
      for (const job of jobs) {
        await QualityLossIndexService.rebuildOne(
          sourceByJobSource[job.source],
          job.sourcePk,
        );
      }
      const result = await QualityLossIndexQueue.complete(jobs, workerId);
      batches += 1;
      processed += result.completed;
      logger.info(
        { batch: batches, completedJobs: result.completed, workerId },
        'quality-loss index worker batch finished',
      );
    } catch (error) {
      await QualityLossIndexQueue.fail(jobs, workerId, error);
      logger.error(
        { err: error, jobCount: jobs.length, workerId },
        'quality-loss index worker batch failed',
      );
      throw error;
    }
  }

  return { batches, processed };
}

function runBackgroundDrain() {
  if (running !== null) return running;
  running = drain()
    .catch((error: unknown) => {
      logger.error({ err: error }, 'quality-loss index worker drain failed');
      return { batches: 0, processed: 0 };
    })
    .finally(() => {
      running = null;
    });
  return running;
}

export const QualityLossIndexWorkerService = { drain };

export function startQualityLossIndexWorker() {
  if (started || process.env.NODE_ENV === 'test') return;
  started = true;
  setImmediate(() => void runBackgroundDrain());
  const timer = setInterval(() => void runBackgroundDrain(), POLL_INTERVAL_MS);
  timer.unref();
}
