import process from 'node:process';

import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';

import {
  backfillInspectionIssueDivisions,
  parseDivisionBackfillOptions,
} from './inspection-issue-division-backfill';

const logger = createModuleLogger('inspection-issue-division-backfill');

async function run() {
  try {
    const options = parseDivisionBackfillOptions(process.argv.slice(2));
    logger.info(options, 'inspection issue division backfill started');
    const summary = await backfillInspectionIssueDivisions(options);
    logger.info(summary, 'inspection issue division backfill finished');
  } finally {
    await prisma.$disconnect();
  }
}

void run().catch((error: unknown) => {
  logger.fatal({ err: error }, 'inspection issue division backfill failed');
  process.exitCode = 1;
});
