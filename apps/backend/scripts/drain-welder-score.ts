import process from 'node:process';

import { WelderScoreWorkerService } from '~/modules/welder/welder-score-worker.service';
import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';

const logger = createModuleLogger('welder-score-drain');

async function run() {
  const result = await WelderScoreWorkerService.drain({
    maxBatches: Number(process.env.WELDER_SCORE_MAX_BATCHES) || 100,
    workerId: `welder-score-cli:${process.pid}`,
  });
  logger.info(result, 'welder score drain finished');
}

void run()
  .catch((error: unknown) => {
    logger.fatal({ err: error }, 'welder score drain failed');
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
