import process from 'node:process';

import { registerMetrologyDueReminder } from '~/modules/metrology/cron/due-reminder';
import { registerNcOverdueReminder } from '~/modules/inspection/cron/nc-overdue';
import { registerSupplierMonthlySnapshot } from '~/modules/supplier/cron/monthly-snapshot';
import { runSchedulerTick, syncCronJobDefinitions } from '~/modules/scheduler';
import { createModuleLogger } from '~/utils/logger';

const logger = createModuleLogger('CronScheduler');

const POLL_INTERVAL_MS = 60_000;

let started = false;

export function startCronScheduler() {
  if (started || process.env.NODE_ENV === 'test') return;
  started = true;

  // Register business jobs (keep in sync with docs/scheduler-design.md §3).
  registerMetrologyDueReminder();
  registerNcOverdueReminder();
  registerSupplierMonthlySnapshot();

  // Persist registered definitions into cron_jobs, then start polling.
  void syncCronJobDefinitions()
    .then(() => {
      logger.info('cron scheduler synced definitions, starting poll loop');
    })
    .catch((error: unknown) => {
      logger.error({ err: error }, 'cron scheduler definition sync failed');
    });

  setImmediate(() => {
    void runSchedulerTick().catch((error: unknown) => {
      logger.error({ err: error }, 'cron scheduler initial tick failed');
    });
  });
  const timer = setInterval(() => {
    void runSchedulerTick().catch((error: unknown) => {
      logger.error({ err: error }, 'cron scheduler tick failed');
    });
  }, POLL_INTERVAL_MS);
  timer.unref();
}

export default defineNitroPlugin(() => {
  startCronScheduler();
});
