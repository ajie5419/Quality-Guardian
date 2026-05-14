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

  throw new Error(
    'Unable to resolve @prisma/client for vehicle commissioning migration',
  );
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

async function addColumn(tableName, columnName, definition, dryRun) {
  if (await columnExists(tableName, columnName)) return;
  if (dryRun) {
    console.log(
      `[vehicle-commissioning-migrate] would add ${tableName}.${columnName}`,
    );
    return;
  }
  await prisma.$executeRawUnsafe(
    `ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${definition}`,
  );
}

async function addIndex(tableName, indexName, columns) {
  if (await indexExists(tableName, indexName)) return;
  await prisma.$executeRawUnsafe(
    `ALTER TABLE \`${tableName}\` ADD INDEX \`${indexName}\` (${columns})`,
  );
}

async function modifyColumnIfExists(tableName, columnName, definition, dryRun) {
  if (!(await columnExists(tableName, columnName))) return;
  if (dryRun) {
    console.log(
      `[vehicle-commissioning-migrate] would modify ${tableName}.${columnName}`,
    );
    return;
  }
  await prisma.$executeRawUnsafe(
    `ALTER TABLE \`${tableName}\` MODIFY COLUMN \`${columnName}\` ${definition}`,
  );
}

async function ensureVehicleCommissioningColumns(dryRun) {
  const tableName = 'vehicle_commissioning_issues';
  await addColumn(
    tableName,
    'date',
    'DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)',
    dryRun,
  );
  await addColumn(
    tableName,
    'status',
    "VARCHAR(191) NOT NULL DEFAULT 'OPEN'",
    dryRun,
  );
  await addColumn(tableName, 'partName', 'VARCHAR(191) NULL', dryRun);
  await addColumn(tableName, 'description', 'TEXT NULL', dryRun);
  await addColumn(
    tableName,
    'responsibleDepartment',
    'VARCHAR(191) NULL',
    dryRun,
  );
  await addColumn(tableName, 'projectName', 'VARCHAR(191) NULL', dryRun);
  await addColumn(tableName, 'workOrderNumber', 'VARCHAR(191) NULL', dryRun);
  await addColumn(tableName, 'severity', 'VARCHAR(191) NULL', dryRun);
  await addColumn(tableName, 'solution', 'TEXT NULL', dryRun);
  await addColumn(tableName, 'issuePhoto', 'TEXT NULL', dryRun);
  await addColumn(
    tableName,
    'isClaim',
    'BOOLEAN NOT NULL DEFAULT false',
    dryRun,
  );
  await addColumn(
    tableName,
    'lossAmount',
    'DECIMAL(10, 2) NOT NULL DEFAULT 0.00',
    dryRun,
  );
  await addColumn(
    tableName,
    'recoveredAmount',
    'DECIMAL(10, 2) NOT NULL DEFAULT 0.00',
    dryRun,
  );
  await addColumn(
    tableName,
    'claimStatus',
    "VARCHAR(191) NOT NULL DEFAULT 'OPEN'",
    dryRun,
  );
  await addColumn(tableName, 'claimNotes', 'TEXT NULL', dryRun);
  await addColumn(tableName, 'createdBy', 'VARCHAR(191) NULL', dryRun);
  await addColumn(tableName, 'closedAt', 'DATETIME(3) NULL', dryRun);
  await addColumn(
    tableName,
    'isDeleted',
    'BOOLEAN NOT NULL DEFAULT false',
    dryRun,
  );
  await addColumn(
    tableName,
    'createdAt',
    'DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)',
    dryRun,
  );
  await addColumn(
    tableName,
    'updatedAt',
    'DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)',
    dryRun,
  );
  await modifyColumnIfExists(tableName, 'serialNumber', 'INTEGER NULL', dryRun);
  await modifyColumnIfExists(
    tableName,
    'projectName',
    'VARCHAR(191) NULL',
    dryRun,
  );
  await modifyColumnIfExists(
    tableName,
    'partName',
    'VARCHAR(191) NULL',
    dryRun,
  );
  await modifyColumnIfExists(tableName, 'description', 'TEXT NULL', dryRun);
  await modifyColumnIfExists(
    tableName,
    'responsibleDepartment',
    'VARCHAR(191) NULL',
    dryRun,
  );
  await modifyColumnIfExists(
    tableName,
    'status',
    "VARCHAR(191) NOT NULL DEFAULT 'OPEN'",
    dryRun,
  );
  await modifyColumnIfExists(
    tableName,
    'updatedAt',
    'DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)',
    dryRun,
  );
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  console.log(
    `[vehicle-commissioning-migrate] start${dryRun ? ' (dry-run)' : ''}`,
  );

  if (!(await tableExists('vehicle_commissioning_issues'))) {
    if (dryRun) {
      console.log(
        '[vehicle-commissioning-migrate] would create vehicle_commissioning_issues',
      );
    } else {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE \`vehicle_commissioning_issues\` (
          \`id\` VARCHAR(191) NOT NULL,
          \`date\` DATETIME(3) NOT NULL,
          \`status\` VARCHAR(191) NOT NULL DEFAULT 'OPEN',
          \`partName\` VARCHAR(191) NULL,
          \`description\` TEXT NULL,
          \`responsibleDepartment\` VARCHAR(191) NULL,
          \`projectName\` VARCHAR(191) NULL,
          \`workOrderNumber\` VARCHAR(191) NULL,
          \`severity\` VARCHAR(191) NULL,
          \`solution\` TEXT NULL,
          \`issuePhoto\` TEXT NULL,
          \`isClaim\` BOOLEAN NOT NULL DEFAULT false,
          \`lossAmount\` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
          \`recoveredAmount\` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
          \`claimStatus\` VARCHAR(191) NOT NULL DEFAULT 'OPEN',
          \`claimNotes\` TEXT NULL,
          \`createdBy\` VARCHAR(191) NULL,
          \`closedAt\` DATETIME(3) NULL,
          \`isDeleted\` BOOLEAN NOT NULL DEFAULT false,
          \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
          PRIMARY KEY (\`id\`)
        ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
      `);
    }
  }

  if (await tableExists('vehicle_commissioning_issues')) {
    await ensureVehicleCommissioningColumns(dryRun);
  }

  if (!dryRun) {
    await addIndex(
      'vehicle_commissioning_issues',
      'vehicle_commissioning_issues_date_idx',
      '`date`',
    );
    await addIndex(
      'vehicle_commissioning_issues',
      'vehicle_commissioning_issues_status_idx',
      '`status`',
    );
    await addIndex(
      'vehicle_commissioning_issues',
      'vehicle_commissioning_issues_isClaim_idx',
      '`isClaim`',
    );
    await addIndex(
      'vehicle_commissioning_issues',
      'vehicle_commissioning_issues_workOrderNumber_idx',
      '`workOrderNumber`',
    );
    await addIndex(
      'vehicle_commissioning_issues',
      'vehicle_commissioning_issues_responsibleDepartment_idx',
      '`responsibleDepartment`',
    );
    await addIndex(
      'vehicle_commissioning_issues',
      'vehicle_commissioning_issues_projectName_idx',
      '`projectName`',
    );
  }

  if (await tableExists('quality_records')) {
    if (dryRun) {
      console.log(
        '[vehicle-commissioning-migrate] would backfill from quality_records.category=vehicle_commissioning',
      );
    } else {
      await prisma.$executeRawUnsafe(`
        INSERT IGNORE INTO \`vehicle_commissioning_issues\` (
          \`id\`,
          \`date\`,
          \`status\`,
          \`partName\`,
          \`description\`,
          \`responsibleDepartment\`,
          \`projectName\`,
          \`workOrderNumber\`,
          \`severity\`,
          \`solution\`,
          \`issuePhoto\`,
          \`isClaim\`,
          \`lossAmount\`,
          \`recoveredAmount\`,
          \`claimStatus\`,
          \`claimNotes\`,
          \`closedAt\`,
          \`isDeleted\`,
          \`createdAt\`,
          \`updatedAt\`
        )
        SELECT
          \`id\`,
          \`date\`,
          CAST(\`status\` AS CHAR),
          \`partName\`,
          \`description\`,
          \`responsibleDepartment\`,
          \`projectName\`,
          \`workOrderNumber\`,
          \`severity\`,
          \`solution\`,
          \`issuePhoto\`,
          \`isClaim\`,
          \`lossAmount\`,
          \`recoveredAmount\`,
          CAST(\`claimStatus\` AS CHAR),
          NULL,
          CASE WHEN CAST(\`status\` AS CHAR) = 'CLOSED' THEN \`updatedAt\` ELSE NULL END,
          \`isDeleted\`,
          \`createdAt\`,
          \`updatedAt\`
        FROM \`quality_records\`
        WHERE \`category\` = 'vehicle_commissioning';
      `);
    }
  }

  console.log('[vehicle-commissioning-migrate] done');
}

main()
  .catch((error) => {
    console.error('[vehicle-commissioning-migrate] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
