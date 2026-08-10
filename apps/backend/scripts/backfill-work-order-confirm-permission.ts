import process from 'node:process';

import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';
import { redis } from '~/utils/redis';

import {
  backfillWorkOrderConfirmPermission,
  parseWorkOrderConfirmPermissionBackfillMode,
} from './work-order-confirm-permission-backfill';

const logger = createModuleLogger('work-order-confirm-permission-backfill');

async function run() {
  try {
    const mode = parseWorkOrderConfirmPermissionBackfillMode(
      process.argv.slice(2),
    );
    const summary = await backfillWorkOrderConfirmPermission(mode);
    logger.info(summary, 'work order confirm permission backfill finished');
  } finally {
    await prisma.$disconnect();
    redis.disconnect();
  }
}

void run().catch((error: unknown) => {
  logger.fatal({ err: error }, 'work order confirm permission backfill failed');
  process.exitCode = 1;
});
