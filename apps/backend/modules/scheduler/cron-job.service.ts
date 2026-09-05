import type { CronJobDefinition } from './scheduler-registry';

import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';

import { matchesCronExpression, parseCronExpression } from './cron-expression';
import { listCronJobs } from './scheduler-registry';

const logger = createModuleLogger('Scheduler');

let running = false;

/**
 * Persist every registered definition into cron_jobs (upsert by jobKey).
 * Called once at plugin startup so the table mirrors the code registry.
 *
 * jobKey is globally unique (SCHEDULER-INTEGRITY-001), so concurrent instance
 * startup can never create duplicate definition rows. The code registry is the
 * single source of truth: rows removed from the registry are disabled (not
 * deleted), and soft-deleted rows are revived by the next sync.
 */
export async function syncCronJobDefinitions(): Promise<void> {
  const definitions = listCronJobs();
  const validRegistryKeys: string[] = [];
  for (const definition of definitions) {
    try {
      parseCronExpression(definition.cronExpr);
    } catch (error) {
      logger.error(
        { err: error, jobKey: definition.key, cronExpr: definition.cronExpr },
        'cron job has invalid expression; skipped',
      );
      continue;
    }
    validRegistryKeys.push(definition.key);
    // Atomic upsert by unique jobKey: registry definition always wins.
    await prisma.cron_jobs.upsert({
      where: { jobKey: definition.key },
      create: {
        jobKey: definition.key,
        cronExpr: definition.cronExpr,
        description: definition.description ?? null,
        enabled: true,
      },
      update: {
        cronExpr: definition.cronExpr,
        description: definition.description ?? null,
        enabled: true,
        isDeleted: false,
      },
    });
  }
  // Registry is the source of truth: disable definitions that no longer exist
  // in code. Never delete them, so history and manual re-enable stay possible.
  await prisma.cron_jobs.updateMany({
    where:
      validRegistryKeys.length === 0
        ? { enabled: true, isDeleted: false }
        : {
            enabled: true,
            isDeleted: false,
            jobKey: { notIn: validRegistryKeys },
          },
    data: { enabled: false },
  });
  logger.info({ jobCount: definitions.length }, 'cron job definitions synced');
}

/**
 * One scheduler tick: find due jobs and run their handlers.
 * Returns the number of jobs executed this tick.
 */
export async function runSchedulerTick(now = new Date()): Promise<number> {
  if (running) return 0;
  running = true;
  let executed = 0;
  // Compare against the minute boundary, not "now minus 60 seconds". A timer
  // that drifts within a minute must still run once in every matching minute.
  const currentMinuteStart = new Date(now);
  currentMinuteStart.setSeconds(0, 0);
  try {
    const dueJobs = await prisma.cron_jobs.findMany({
      where: {
        enabled: true,
        isDeleted: false,
        OR: [
          { lastRunAt: null },
          // lastRunAt strictly before the current minute
          { lastRunAt: { lt: currentMinuteStart } },
        ],
      },
      select: {
        cronExpr: true,
        description: true,
        enabled: true,
        id: true,
        jobKey: true,
        lastError: true,
        lastRunAt: true,
        lastStatus: true,
      },
    });

    for (const job of dueJobs) {
      let matches: boolean;
      try {
        matches = matchesCronExpression(job.cronExpr, now);
      } catch (error) {
        logger.error(
          { err: error, jobKey: job.jobKey, cronExpr: job.cronExpr },
          'cron job expression invalid; marking error',
        );
        await markJobError(job.id, job.jobKey, error);
        continue;
      }
      if (!matches) continue;

      // At-most-once per minute: CAS on lastRunAt before this minute.
      const claimed = await prisma.cron_jobs.updateMany({
        where: {
          id: job.id,
          enabled: true,
          isDeleted: false,
          OR: [{ lastRunAt: null }, { lastRunAt: { lt: currentMinuteStart } }],
        },
        data: { lastRunAt: now },
      });
      if (claimed.count === 0) continue;

      const definition = listCronJobs().find((item) => item.key === job.jobKey);
      if (!definition) {
        logger.warn(
          { jobKey: job.jobKey },
          'cron job has no registered handler',
        );
        await markJobError(
          job.id,
          job.jobKey,
          new Error('no registered handler'),
        );
        continue;
      }

      await runHandler(job.id, job.jobKey, definition);
      executed += 1;
    }
  } catch (error) {
    logger.error({ err: error }, 'scheduler tick failed');
  } finally {
    running = false;
  }
  return executed;
}

async function runHandler(
  jobId: string,
  jobKey: string,
  definition: CronJobDefinition,
) {
  try {
    await definition.handler();
    await prisma.cron_jobs.update({
      where: { id: jobId },
      data: { lastStatus: 'ok', lastError: null },
    });
    logger.info({ jobKey }, 'cron job executed');
  } catch (error) {
    logger.error({ err: error, jobKey }, 'cron job handler failed');
    await markJobError(jobId, jobKey, error);
  }
}

async function markJobError(jobId: string, jobKey: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  await prisma.cron_jobs.update({
    where: { id: jobId },
    data: { lastStatus: 'error', lastError: message.slice(0, 2000) },
  });
}
