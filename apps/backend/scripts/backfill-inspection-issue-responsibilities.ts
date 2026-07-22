import process from 'node:process';

import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';

import {
  backfillInspectionIssueResponsibilities,
  parseResponsibilityBackfillOptions,
} from './inspection-issue-responsibility-backfill';

const logger = createModuleLogger('inspection-issue-responsibility-backfill');

async function run() {
  try {
    const options = parseResponsibilityBackfillOptions(process.argv.slice(2));
    logger.info(options, 'inspection issue responsibility backfill started');
    const summary = await backfillInspectionIssueResponsibilities(options);
    logger.info(summary, 'inspection issue responsibility backfill finished');
  } finally {
    await prisma.$disconnect();
  }
}

void run().catch((error: unknown) => {
  logger.fatal(
    { err: error },
    'inspection issue responsibility backfill failed',
  );
  process.exitCode = 1;
});
