import type { ReleaseMaintenanceLedger } from './release-maintenance-runner';

import process from 'node:process';

import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';

import {
  assertValidReleaseMaintenanceManifest,
  releaseMaintenanceManifest,
} from './release-maintenance-manifest';
import { runReleaseMaintenance } from './release-maintenance-runner';

const logger = createModuleLogger('release-maintenance');

const releaseMaintenanceLedger: ReleaseMaintenanceLedger = {
  async claim(input) {
    const result = await prisma.release_maintenance_tasks.updateMany({
      where: {
        id: input.id,
        OR: [
          { status: 'FAILED' },
          { leaseUntil: { lte: input.now }, status: 'RUNNING' },
        ],
      },
      data: {
        attemptToken: input.attemptToken,
        attempts: { increment: 1 },
        lastError: null,
        leaseUntil: input.leaseUntil,
        startedAt: input.now,
        status: 'RUNNING',
      },
    });
    return result.count;
  },
  async complete(input) {
    const result = await prisma.release_maintenance_tasks.updateMany({
      where: {
        attemptToken: input.attemptToken,
        id: input.id,
        status: 'RUNNING',
      },
      data: {
        attemptToken: null,
        completedAt: input.now,
        lastError: null,
        leaseUntil: null,
        status: 'COMPLETED',
      },
    });
    return result.count;
  },
  async create(input) {
    return prisma.release_maintenance_tasks.create({
      data: {
        attemptToken: input.attemptToken,
        attempts: 1,
        checksum: input.checksum,
        leaseUntil: input.leaseUntil,
        revision: input.revision,
        startedAt: input.now,
        status: 'RUNNING',
        taskKey: input.taskKey,
      },
      select: {
        attempts: true,
        checksum: true,
        completedAt: true,
        id: true,
        leaseUntil: true,
        revision: true,
        status: true,
        taskKey: true,
      },
    });
  },
  async fail(input) {
    const result = await prisma.release_maintenance_tasks.updateMany({
      where: {
        attemptToken: input.attemptToken,
        id: input.id,
        status: 'RUNNING',
      },
      data: {
        attemptToken: null,
        lastError: input.error,
        leaseUntil: null,
        status: 'FAILED',
      },
    });
    return result.count;
  },
  async find(input) {
    return prisma.release_maintenance_tasks.findUnique({
      where: {
        taskKey_revision: {
          revision: input.revision,
          taskKey: input.taskKey,
        },
      },
      select: {
        attempts: true,
        checksum: true,
        completedAt: true,
        id: true,
        leaseUntil: true,
        revision: true,
        status: true,
        taskKey: true,
      },
    });
  },
};

async function run() {
  try {
    assertValidReleaseMaintenanceManifest(releaseMaintenanceManifest);
    logger.info(
      { taskCount: releaseMaintenanceManifest.length },
      'release maintenance manifest started',
    );
    await runReleaseMaintenance({
      ledger: releaseMaintenanceLedger,
      logger,
      tasks: releaseMaintenanceManifest,
    });
  } finally {
    await prisma.$disconnect();
  }
}

void run().catch((error: unknown) => {
  logger.fatal({ err: error }, 'release maintenance failed');
  process.exitCode = 1;
});
