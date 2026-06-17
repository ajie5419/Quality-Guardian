import process from 'node:process';

import { SupplierScoreSnapshotService } from '~/modules/supplier';
import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';

const logger = createModuleLogger('supplier-score-backfill');

function parsePositiveInteger(value: string | undefined) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

async function main() {
  const mode = process.env.SUPPLIER_SCORE_BACKFILL_MODE || 'all';
  const options = {
    batchSize: parsePositiveInteger(process.env.SUPPLIER_SCORE_BACKFILL_BATCH),
    maxBatches: parsePositiveInteger(
      process.env.SUPPLIER_SCORE_BACKFILL_MAX_BATCHES,
    ),
  };

  logger.info({ mode, ...options }, 'supplier score backfill started');
  const result =
    mode === 'missing'
      ? await SupplierScoreSnapshotService.refreshMissing(options)
      : await SupplierScoreSnapshotService.refreshAll(options);
  logger.info({ mode, ...result }, 'supplier score backfill finished');
}

main()
  .catch((error: unknown) => {
    throw error;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
