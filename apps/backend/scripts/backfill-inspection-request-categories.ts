import process from 'node:process';

import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';
import { redis } from '~/utils/redis';

import {
  backfillInspectionRequestCategories,
  parseInspectionRequestCategoryBackfillOptions,
} from './inspection-request-category-backfill';

const logger = createModuleLogger(
  'inspection-request-category-backfill-runner',
);

async function run() {
  try {
    await backfillInspectionRequestCategories(
      parseInspectionRequestCategoryBackfillOptions(process.argv.slice(2)),
    );
  } finally {
    await prisma.$disconnect();
    redis.disconnect();
  }
}

void run().catch((error: unknown) => {
  logger.fatal({ err: error }, 'inspection request category backfill failed');
  process.exitCode = 1;
});
