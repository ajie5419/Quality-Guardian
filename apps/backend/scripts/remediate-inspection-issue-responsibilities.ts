import process from 'node:process';

import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';
import { redis } from '~/utils/redis';

import {
  assertInspectionIssueResponsibilityRemediationSucceeded,
  parseInspectionIssueResponsibilityRemediationOptions,
  remediateCorruptedInspectionIssueResponsibilities,
} from './inspection-issue-responsibility-remediation';

const logger = createModuleLogger(
  'inspection-issue-responsibility-remediation',
);

async function run() {
  try {
    const options = parseInspectionIssueResponsibilityRemediationOptions(
      process.argv.slice(2),
    );
    logger.info(
      options,
      'corrupted inspection issue responsibility remediation started',
    );
    const summary =
      await remediateCorruptedInspectionIssueResponsibilities(options);
    assertInspectionIssueResponsibilityRemediationSucceeded(summary);
    logger.info(
      summary,
      'corrupted inspection issue responsibility remediation finished',
    );
  } finally {
    // The remediation path opens Redis transitively (SupplierIdentityService ->
    // MetricRefreshQueue). Without disconnecting, the one-shot process never
    // exits and the deploy maintenance 600s timeout rolls back the release.
    await prisma.$disconnect();
    redis.disconnect();
  }
}

void run().catch((error: unknown) => {
  logger.fatal(
    { err: error },
    'corrupted inspection issue responsibility remediation failed',
  );
  process.exitCode = 1;
});
