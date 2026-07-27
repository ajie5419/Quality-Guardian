import process from 'node:process';

import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';
import { redis } from '~/utils/redis';

import {
  parseTeamIdentityReconciliationOptions,
  reconcileTeamIdentities,
} from './team-identity-reconciliation';

const logger = createModuleLogger('team-identity-reconciliation-runner');

async function run() {
  try {
    const options = parseTeamIdentityReconciliationOptions(
      process.argv.slice(2),
    );
    await reconcileTeamIdentities(options);
  } finally {
    await prisma.$disconnect();
    redis.disconnect();
  }
}

void run().catch((error: unknown) => {
  logger.fatal({ err: error }, 'TEAM identity reconciliation failed');
  process.exitCode = 1;
});
