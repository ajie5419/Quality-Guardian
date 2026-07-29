import process from 'node:process';

import {
  teamIdentityMergeSchema,
  TeamIdentityMergeService,
} from '~/modules/team';
import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';
import { redis } from '~/utils/redis';

const logger = createModuleLogger('team-identity-merge-runner');

function parseNamedArguments(args: string[]) {
  const values = new Map<string, string>();
  for (const argument of args) {
    const separator = argument.indexOf('=');
    if (!argument.startsWith('--') || separator < 3) {
      throw new Error(`Invalid argument: ${argument}`);
    }
    values.set(argument.slice(2, separator), argument.slice(separator + 1));
  }
  return values;
}

async function run() {
  try {
    const args = parseNamedArguments(process.argv.slice(2));
    const input = teamIdentityMergeSchema.parse({
      reason: args.get('reason'),
      sourceTeamId: args.get('source-team-id'),
      targetTeamId: args.get('target-team-id'),
    });
    const operator = args.get('operator')?.trim();
    if (!operator) throw new Error('--operator is required');
    const result = await TeamIdentityMergeService.merge(input, operator);
    logger.info(result, 'TEAM identity maintenance merge completed');
  } finally {
    await prisma.$disconnect();
    redis.disconnect();
  }
}

void run().catch((error: unknown) => {
  logger.fatal({ err: error }, 'TEAM identity maintenance merge failed');
  process.exitCode = 1;
});
