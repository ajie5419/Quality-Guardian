import process from 'node:process';

import { MetricRefreshQueue } from '~/modules/metric-refresh';
import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';

const logger = createModuleLogger('welder-score-enqueue');
const batchSize = 500;

async function enqueueWelders(apply: boolean) {
  let cursor: string | undefined;
  let enqueued = 0;
  let scanned = 0;
  for (;;) {
    const rows = await prisma.welders.findMany({
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { id: 'asc' },
      select: { id: true },
      take: batchSize,
      where: { isDeleted: false },
    });
    if (rows.length === 0) break;
    scanned += rows.length;
    if (apply) {
      const result = await prisma.$transaction((tx) =>
        MetricRefreshQueue.enqueueWelderScores(
          tx,
          rows.map((row) => row.id),
          'welder-score.historical-enqueue',
        ),
      );
      enqueued += result.enqueued;
    }
    cursor = rows.at(-1)?.id;
    if (rows.length < batchSize) break;
  }
  return { enqueued, scanned };
}

async function run() {
  const apply = process.argv.includes('--apply');
  const result = await enqueueWelders(apply);
  logger.info({ apply, ...result }, 'welder score historical enqueue finished');
  if (!apply) {
    logger.info(
      { command: 'pnpm maintenance:welder-score:enqueue -- --apply' },
      'dry run only; pass --apply to append durable score refresh jobs',
    );
  }
}

void run()
  .catch((error: unknown) => {
    logger.fatal({ err: error }, 'welder score historical enqueue failed');
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
