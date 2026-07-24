import process from 'node:process';

import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';
import { redis } from '~/utils/redis';

import {
  backfillRolePagePermissions,
  parseRolePagePermissionBackfillMode,
} from './role-page-permission-backfill';

const logger = createModuleLogger('role-page-permission-backfill');

async function run() {
  try {
    const mode = parseRolePagePermissionBackfillMode(process.argv.slice(2));
    const summary = await backfillRolePagePermissions(mode);
    logger.info(summary, 'role page permission backfill finished');
  } finally {
    await prisma.$disconnect();
    redis.disconnect();
  }
}

void run().catch((error: unknown) => {
  logger.fatal({ err: error }, 'role page permission backfill failed');
  process.exitCode = 1;
});
