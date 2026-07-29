import { hostname } from 'node:os';
import process from 'node:process';

import { createId } from '@paralleldrive/cuid2';
import { MetricRefreshQueue } from '~/modules/metric-refresh';
import { createModuleLogger } from '~/utils/logger';

import { SupplierScoreSnapshotService } from './supplier-score-snapshot.service';

interface DrainOptions {
  batchSize?: number;
  maxBatches?: number;
  workerId?: string;
}

const DEFAULT_MAX_BATCHES = 20;
const POLL_INTERVAL_MS = 5000;
const logger = createModuleLogger('SupplierScoreWorker');
const processWorkerId = `${hostname()}:${process.pid}:${createId()}`;

let started = false;
let running: null | Promise<{ batches: number; processed: number }> = null;

async function drain(options: DrainOptions = {}) {
  const workerId = options.workerId ?? processWorkerId;
  let batches = 0;
  let processed = 0;

  while (batches < (options.maxBatches ?? DEFAULT_MAX_BATCHES)) {
    const jobs = await MetricRefreshQueue.claimSupplierScoreJobs({
      limit: options.batchSize,
      workerId,
    });
    if (jobs.length === 0) break;

    try {
      await SupplierScoreSnapshotService.refreshBySupplierIds([
        ...new Set(jobs.map((job) => job.entityId)),
      ]);
      const result = await MetricRefreshQueue.completeSupplierScoreJobs(
        jobs.map((job) => job.entityId),
        workerId,
      );
      processed += result.completed;
      batches += 1;
      logger.info(
        {
          batch: batches,
          completedJobs: result.completed,
          supplierCount: jobs.length,
          workerId,
        },
        'supplier score worker batch finished',
      );
    } catch (error) {
      await MetricRefreshQueue.failSupplierScoreJobs(jobs, workerId, error);
      logger.error(
        { err: error, jobCount: jobs.length, workerId },
        'supplier score worker batch failed',
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
      logger.error({ err: error }, 'supplier score worker drain failed');
      return { batches: 0, processed: 0 };
    })
    .finally(() => {
      running = null;
    });
  return running;
}

export const SupplierScoreWorkerService = {
  drain,
};

export function startSupplierScoreWorker() {
  if (started || process.env.NODE_ENV === 'test') return;
  started = true;
  setImmediate(() => void runBackgroundDrain());
  const timer = setInterval(() => void runBackgroundDrain(), POLL_INTERVAL_MS);
  timer.unref();
}
