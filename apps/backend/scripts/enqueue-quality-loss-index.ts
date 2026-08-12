import process from 'node:process';

import { QualityLossIndexQueue } from '~/modules/quality-loss';
import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';

const logger = createModuleLogger('quality-loss-index-enqueue');
const batchSize = 500;

type SourceConfig = {
  findMany: (args: {
    cursor?: { id: string };
    orderBy: { id: 'asc' };
    select: { id: true };
    skip?: number;
    take: number;
  }) => Promise<Array<{ id: string }>>;
  source: 'COMMISSIONING' | 'EXTERNAL' | 'INTERNAL' | 'MANUAL';
};

const sourceConfigs: SourceConfig[] = [
  {
    source: 'MANUAL',
    findMany: (args) => prisma.quality_losses.findMany(args),
  },
  {
    source: 'INTERNAL',
    findMany: (args) => prisma.quality_records.findMany(args),
  },
  { source: 'EXTERNAL', findMany: (args) => prisma.after_sales.findMany(args) },
  {
    source: 'COMMISSIONING',
    findMany: (args) => prisma.vehicle_commissioning_issues.findMany(args),
  },
];

async function enqueueSource(config: SourceConfig, apply: boolean) {
  let cursor: string | undefined;
  let enqueued = 0;
  let scanned = 0;
  for (;;) {
    const rows = await config.findMany({
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { id: 'asc' },
      select: { id: true },
      take: batchSize,
    });
    if (rows.length === 0) break;
    scanned += rows.length;
    if (apply) {
      const result = await prisma.$transaction((tx) =>
        QualityLossIndexQueue.enqueue(
          tx,
          rows.map((row) => ({ source: config.source, sourcePk: row.id })),
          'quality-loss-index.historical-enqueue',
        ),
      );
      enqueued += result.enqueued;
    }
    cursor = rows.at(-1)?.id;
    if (rows.length < batchSize) break;
  }
  return { enqueued, scanned, source: config.source };
}

async function run() {
  const apply = process.argv.includes('--apply');
  const results = [];
  for (const config of sourceConfigs) {
    results.push(await enqueueSource(config, apply));
  }
  logger.info(
    { apply, results },
    'quality-loss index historical enqueue finished',
  );
  if (!apply) {
    logger.info(
      { command: 'pnpm maintenance:quality-loss-index:enqueue -- --apply' },
      'dry run only; pass --apply to append durable index jobs',
    );
  }
}

void run()
  .catch((error: unknown) => {
    logger.fatal(
      { err: error },
      'quality-loss index historical enqueue failed',
    );
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
