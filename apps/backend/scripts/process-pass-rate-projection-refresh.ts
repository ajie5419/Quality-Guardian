import process from 'node:process';

import { PassRateProjectionRolloutService } from '~/modules/report';

import { closeConnections } from './close-connections';

export function parsePassRateProjectionRefreshOptions(args: string[]) {
  if (args.length !== 1 || args[0] !== '--apply') {
    throw new Error('APPLY_REQUIRED');
  }
}

export async function processPassRateProjectionRefresh(
  args = process.argv.slice(2),
) {
  parsePassRateProjectionRefreshOptions(args);
  return PassRateProjectionRolloutService.processNextRebuild();
}

if (process.argv[1]?.endsWith('process-pass-rate-projection-refresh.ts')) {
  void processPassRateProjectionRefresh()
    .then(async (summary) => {
      process.stdout.write(`${JSON.stringify(summary)}\n`);
      await closeConnections();
    })
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
}
