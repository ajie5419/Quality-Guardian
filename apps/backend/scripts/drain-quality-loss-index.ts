import process from 'node:process';

import { QualityLossIndexWorkerService } from '~/modules/quality-loss';
import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';

const logger = createModuleLogger('quality-loss-index-drain');

async function run() {
  const result = await QualityLossIndexWorkerService.drain({
    maxBatches: Number(process.env.QUALITY_LOSS_INDEX_MAX_BATCHES) || 100,
    workerId: `quality-loss-index-cli:${process.pid}`,
  });
  logger.info(result, 'quality-loss index drain finished');
}

void run()
  .catch((error: unknown) => {
    logger.fatal({ err: error }, 'quality-loss index drain failed');
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
