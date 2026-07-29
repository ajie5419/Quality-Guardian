import process from 'node:process';

import { createModuleLogger } from '~/utils/logger';

import { bootstrapInspectionRequestProcessOptions } from './inspection-request-process-option-bootstrap';

const logger = createModuleLogger('inspection-process-option-bootstrap');

async function main() {
  if (!process.argv.includes('--apply')) {
    throw new Error('The --apply flag is required');
  }
  const result = await bootstrapInspectionRequestProcessOptions();
  logger.info(result, 'Inspection request process options bootstrapped');
}

main().catch((error: unknown) => {
  logger.error(error, 'Inspection request process option bootstrap failed');
  process.exitCode = 1;
});
