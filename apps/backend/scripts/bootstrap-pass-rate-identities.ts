import process from 'node:process';

import { createModuleLogger } from '~/utils/logger';

import { bootstrapPassRateIdentityBindings } from './pass-rate-identity-bootstrap';

const logger = createModuleLogger('pass-rate-identity-bootstrap');

async function main() {
  if (!process.argv.includes('--apply')) {
    throw new Error('The --apply flag is required');
  }
  const result = await bootstrapPassRateIdentityBindings();
  logger.info(result, 'Pass-rate identity bindings bootstrapped');
}

main().catch((error: unknown) => {
  logger.error(error, 'Pass-rate identity bootstrap failed');
  process.exitCode = 1;
});
