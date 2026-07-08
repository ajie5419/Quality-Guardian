import process from 'node:process';

import { backfillMissingThumbnails } from '~/modules/file-storage/thumbnail-backfill';
import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';

const logger = createModuleLogger('thumbnail-backfill-script');

function parsePositiveInteger(value: string | undefined) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

async function main() {
  const batchSize = parsePositiveInteger(process.env.THUMBNAIL_BACKFILL_BATCH);
  const dryRun = process.env.THUMBNAIL_BACKFILL_DRY_RUN === '1';

  logger.info({ batchSize, dryRun }, 'thumbnail backfill started');
  const result = await backfillMissingThumbnails({
    ...(batchSize ? { batchSize } : {}),
    dryRun,
  });
  logger.info(result, 'thumbnail backfill finished');
}

main()
  .catch((error: unknown) => {
    throw error;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
