/* eslint-disable no-console */
import { createRequire } from 'node:module';
import process from 'node:process';

const require = createRequire(import.meta.url);

function loadPrismaClient() {
  const candidates = [
    '@prisma/client',
    '../node_modules/@prisma/client',
    '../apps/backend/node_modules/@prisma/client',
  ];

  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch {
      // Support local source, container and built deployment layouts.
    }
  }

  throw new Error('Unable to resolve @prisma/client for inspection migration');
}

const { PrismaClient } = loadPrismaClient();
const prisma = new PrismaClient();

async function tableExists(name) {
  const rows = await prisma.$queryRawUnsafe(
    'SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
    name,
  );
  return rows.length > 0;
}

async function indexExists(tableName, indexName) {
  const rows = await prisma.$queryRawUnsafe(
    'SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?',
    tableName,
    indexName,
  );
  return rows.length > 0;
}

async function columnExists(tableName, columnName) {
  const rows = await prisma.$queryRawUnsafe(
    'SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
    tableName,
    columnName,
  );
  return rows.length > 0;
}

async function addIndex(tableName, indexName, columns, unique = false) {
  if (await indexExists(tableName, indexName)) {
    return;
  }

  await prisma.$executeRawUnsafe(
    `ALTER TABLE \`${tableName}\` ADD ${unique ? 'UNIQUE ' : ''}INDEX \`${indexName}\` (${columns})`,
  );
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  console.log(
    `[inspection-requests-migrate] start${dryRun ? ' (dry-run)' : ''}`,
  );

  if (!(await tableExists('qms_inspection_requests'))) {
    if (dryRun) {
      console.log('[inspection-requests-migrate] would create table');
      return;
    }

    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`qms_inspection_requests\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`requestNo\` VARCHAR(191) NOT NULL,
        \`workOrderNumber\` VARCHAR(191) NOT NULL,
        \`partName\` VARCHAR(191) NOT NULL,
        \`processName\` VARCHAR(191) NOT NULL,
        \`team\` VARCHAR(191) NULL,
        \`quantity\` INTEGER NOT NULL DEFAULT 1,
        \`reporter\` VARCHAR(191) NOT NULL,
        \`selfCheckResult\` VARCHAR(191) NOT NULL DEFAULT 'PASS',
        \`mutualCheckResult\` VARCHAR(191) NOT NULL DEFAULT 'PASS',
        \`requestInfo\` TEXT NULL,
        \`attachments\` LONGTEXT NULL,
        \`status\` ENUM('SUBMITTED','DISPATCHED','INSPECTING','CLOSED','CANCELLED') NOT NULL DEFAULT 'SUBMITTED',
        \`priority\` INTEGER NOT NULL DEFAULT 3,
        \`dispatcherId\` VARCHAR(191) NULL,
        \`inspectorId\` VARCHAR(191) NULL,
        \`dispatchTaskId\` VARCHAR(191) NULL,
        \`inspectionId\` VARCHAR(191) NULL,
        \`dispatchRemark\` TEXT NULL,
        \`closeRemark\` TEXT NULL,
        \`submittedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`dispatchedAt\` DATETIME(3) NULL,
        \`closedAt\` DATETIME(3) NULL,
        \`isDeleted\` BOOLEAN NOT NULL DEFAULT false,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    `);

    await prisma.$executeRawUnsafe(
      'ALTER TABLE `qms_inspection_requests` ADD CONSTRAINT `qms_inspection_requests_workOrderNumber_fkey` FOREIGN KEY (`workOrderNumber`) REFERENCES `work_orders`(`workOrderNumber`) ON DELETE RESTRICT ON UPDATE CASCADE',
    );
    await prisma.$executeRawUnsafe(
      'ALTER TABLE `qms_inspection_requests` ADD CONSTRAINT `qms_inspection_requests_dispatcherId_fkey` FOREIGN KEY (`dispatcherId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE',
    );
    await prisma.$executeRawUnsafe(
      'ALTER TABLE `qms_inspection_requests` ADD CONSTRAINT `qms_inspection_requests_inspectorId_fkey` FOREIGN KEY (`inspectorId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE',
    );
    await prisma.$executeRawUnsafe(
      'ALTER TABLE `qms_inspection_requests` ADD CONSTRAINT `qms_inspection_requests_dispatchTaskId_fkey` FOREIGN KEY (`dispatchTaskId`) REFERENCES `qms_task_dispatches`(`id`) ON DELETE SET NULL ON UPDATE CASCADE',
    );
    await prisma.$executeRawUnsafe(
      'ALTER TABLE `qms_inspection_requests` ADD CONSTRAINT `qms_inspection_requests_inspectionId_fkey` FOREIGN KEY (`inspectionId`) REFERENCES `inspections`(`id`) ON DELETE SET NULL ON UPDATE CASCADE',
    );
  }

  if (!dryRun) {
    if (!(await columnExists('qms_inspection_requests', 'team'))) {
      await prisma.$executeRawUnsafe(
        'ALTER TABLE `qms_inspection_requests` ADD COLUMN `team` VARCHAR(191) NULL AFTER `processName`',
      );
    }
    if (!(await columnExists('qms_inspection_requests', 'quantity'))) {
      await prisma.$executeRawUnsafe(
        'ALTER TABLE `qms_inspection_requests` ADD COLUMN `quantity` INTEGER NOT NULL DEFAULT 1 AFTER `team`',
      );
    }
    if (!(await columnExists('qms_inspection_requests', 'attachments'))) {
      await prisma.$executeRawUnsafe(
        'ALTER TABLE `qms_inspection_requests` ADD COLUMN `attachments` LONGTEXT NULL AFTER `requestInfo`',
      );
    }

    await addIndex(
      'qms_inspection_requests',
      'qms_inspection_requests_requestNo_key',
      '`requestNo`',
      true,
    );
    await addIndex(
      'qms_inspection_requests',
      'qms_inspection_requests_inspectionId_key',
      '`inspectionId`',
      true,
    );
    await addIndex(
      'qms_inspection_requests',
      'qms_inspection_requests_workOrderNumber_idx',
      '`workOrderNumber`',
    );
    await addIndex(
      'qms_inspection_requests',
      'qms_inspection_requests_status_idx',
      '`status`',
    );
    await addIndex(
      'qms_inspection_requests',
      'qms_inspection_requests_inspectorId_idx',
      '`inspectorId`',
    );
    await addIndex(
      'qms_inspection_requests',
      'qms_inspection_requests_dispatcherId_idx',
      '`dispatcherId`',
    );
    await addIndex(
      'qms_inspection_requests',
      'qms_inspection_requests_submittedAt_idx',
      '`submittedAt`',
    );
    await addIndex(
      'qms_inspection_requests',
      'qms_inspection_requests_workOrder_process_part_idx',
      '`workOrderNumber`, `processName`, `partName`',
    );
  }

  console.log('[inspection-requests-migrate] done');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
