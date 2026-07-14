import process from 'node:process';

import { QualityLossIndexService } from '~/modules/quality-loss';
import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';
import { redis } from '~/utils/redis';

const logger = createModuleLogger('quality-loss-index-backfill');

function parsePositiveInteger(value: string | undefined) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

async function main() {
  const batchSize = parsePositiveInteger(
    process.env.QUALITY_LOSS_BACKFILL_BATCH,
  );
  const options = batchSize ? { batchSize } : {};

  logger.info({ ...options }, 'quality-loss index backfill started');

  const manual = await QualityLossIndexService.backfillManual(options);
  logger.info({ source: 'Manual', ...manual }, 'manual backfill done');

  const internal = await QualityLossIndexService.backfillInternal(options);
  logger.info({ source: 'Internal', ...internal }, 'internal backfill done');

  const external = await QualityLossIndexService.backfillAfterSales(options);
  logger.info({ source: 'External', ...external }, 'external backfill done');

  const commissioning =
    await QualityLossIndexService.backfillCommissioning(options);
  logger.info(
    { source: 'Commissioning', ...commissioning },
    'commissioning backfill done',
  );

  logger.info(
    {
      total:
        manual.processed +
        internal.processed +
        external.processed +
        commissioning.processed,
    },
    'quality-loss index backfill finished',
  );
}

async function run() {
  try {
    await main();
  } finally {
    await prisma.$disconnect();
    redis.disconnect();
  }
}

void run().catch((error: unknown) => {
  logger.fatal({ err: error }, 'quality-loss index backfill failed');
  process.exitCode = 1;
});
