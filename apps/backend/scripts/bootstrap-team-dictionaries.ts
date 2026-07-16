import type { TeamDictionaryBootstrapMode } from './team-dictionary-bootstrap';

import process from 'node:process';

import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';

import { bootstrapTeamDictionaries } from './team-dictionary-bootstrap';

const logger = createModuleLogger('team-dictionary-bootstrap');

function parseMode(args: string[]): TeamDictionaryBootstrapMode {
  let mode: TeamDictionaryBootstrapMode = 'dry-run';
  for (const arg of args) {
    if (arg === '--apply') mode = 'apply';
    else if (arg === '--dry-run') mode = 'dry-run';
    else throw new Error(`unknown argument: ${arg}`);
  }
  return mode;
}

async function run() {
  try {
    const result = await bootstrapTeamDictionaries(
      parseMode(process.argv.slice(2)),
    );
    logger.info(result, 'TEAM dictionary bootstrap finished');
  } finally {
    await prisma.$disconnect();
  }
}

void run().catch((error: unknown) => {
  logger.error({ err: error }, 'TEAM dictionary bootstrap failed');
  process.exitCode = 1;
});
