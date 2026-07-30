import process from 'node:process';

import { MasterDataGovernanceKernel } from '~/utils/canonical-master-data';
import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';
import { redis } from '~/utils/redis';

import {
  backfillBomRequiredProcessIdentities,
  backfillInspectionPartIdentities,
  backfillWorkOrderRequirementProcessIdentities,
} from './identity-relation-backfill';
import {
  backfillQualityLossSourceDepartmentIdentities,
  backfillReportingProjectIdentities,
} from './reporting-identity-backfill';

const logger = createModuleLogger('identity-relation-backfill');

async function main() {
  const seed = await MasterDataGovernanceKernel.runGovernanceByFields({
    configKeys: ['partName', 'processName'],
    failOnAuditError: false,
    runAudit: false,
    runBackfill: false,
  });
  const processBootstrap =
    await MasterDataGovernanceKernel.bootstrapCanonicalFromTargetNames(
      'processName',
    );
  const projectBootstrap =
    await MasterDataGovernanceKernel.bootstrapCanonicalFromTargetNames(
      'projectName',
    );
  const workOrderProcesses =
    await backfillWorkOrderRequirementProcessIdentities();
  const inspections = await backfillInspectionPartIdentities();
  const bomProcesses = await backfillBomRequiredProcessIdentities();
  const reportingProjects = await backfillReportingProjectIdentities();
  const qualityLossDepartments =
    await backfillQualityLossSourceDepartmentIdentities();
  const governance = await MasterDataGovernanceKernel.runGovernanceByFields({
    configKeys: ['partName', 'processName'],
    failOnAuditError: false,
    runAudit: false,
    runSeed: false,
  });
  logger.info(
    {
      bomProcesses,
      governance,
      inspections,
      processBootstrap,
      projectBootstrap,
      qualityLossDepartments,
      reportingProjects,
      seed,
      workOrderProcesses,
    },
    'identity relation backfill completed',
  );
}

async function run() {
  try {
    await main();
  } catch (error: unknown) {
    logger.fatal({ err: error }, 'identity relation backfill failed');
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
    redis.disconnect();
  }
}

void run();
