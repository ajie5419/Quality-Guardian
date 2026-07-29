import process from 'node:process';

import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';

import {
  backfillQualityClassifications,
  parseQualityClassificationBackfillOptions,
} from './quality-classification-backfill';
import { bootstrapQualityClassifications } from './quality-classification-bootstrap';

const logger = createModuleLogger('quality-classification-backfill');

async function run() {
  const options = parseQualityClassificationBackfillOptions(
    process.argv.slice(2),
  );
  try {
    const bootstrap =
      options.mode === 'apply'
        ? await bootstrapQualityClassifications()
        : { categoriesCreated: 0, subcategoriesCreated: 0 };
    const backfill = await backfillQualityClassifications(options);
    logger.info(
      { backfill, bootstrap, mode: options.mode },
      'Quality classification maintenance finished',
    );
  } finally {
    await prisma.$disconnect();
  }
}

void run().catch((error: unknown) => {
  logger.fatal({ err: error }, 'Quality classification maintenance failed');
  process.exitCode = 1;
});
