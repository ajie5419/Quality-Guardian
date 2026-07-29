import process from 'node:process';

import { SupplierScoreReconciliationService } from '~/modules/supplier/supplier-score-reconciliation.service';
import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';
import { redis } from '~/utils/redis';

const logger = createModuleLogger('supplier-score-reconciliation');

async function main() {
  logger.info('supplier score reconciliation started');
  const result = await SupplierScoreReconciliationService.reconcileForRelease();
  logger.info(result, 'supplier score reconciliation finished with zero jobs');
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
  logger.fatal({ err: error }, 'supplier score reconciliation failed');
  process.exitCode = 1;
});
