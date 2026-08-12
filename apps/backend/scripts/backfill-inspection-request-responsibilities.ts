import process from 'node:process';

import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';
import { redis } from '~/utils/redis';

import {
  assertInspectionRequestResponsibilityBackfillSucceeded,
  backfillInspectionRequestResponsibilities,
  parseInspectionRequestResponsibilityBackfillOptions,
} from './inspection-request-responsibility-backfill';

const logger = createModuleLogger('inspection-request-responsibility-backfill');

async function run() {
  try {
    const options = parseInspectionRequestResponsibilityBackfillOptions(
      process.argv.slice(2),
    );
    logger.info(options, 'inspection request responsibility backfill started');
    const summary = await backfillInspectionRequestResponsibilities(options);
    assertInspectionRequestResponsibilityBackfillSucceeded(summary);
    logger.info(summary, 'inspection request responsibility backfill finished');
  } finally {
    await prisma.$disconnect();
    redis.disconnect();
  }
}

void run().catch((error: unknown) => {
  logger.fatal(
    { err: error },
    'inspection request responsibility backfill failed',
  );
  process.exitCode = 1;
});
