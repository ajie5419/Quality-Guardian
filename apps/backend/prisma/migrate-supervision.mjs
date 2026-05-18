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

  throw new Error('Unable to resolve @prisma/client for supervision migration');
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
      `[supervision-migrate] would add column ${tableName}.${columnName}`,
    );
    return;
  }
  await prisma.$executeRawUnsafe(
    `ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${definition}`,
  );
}

async function addIndex(tableName, indexName, columns, dryRun) {
  if (await indexExists(tableName, indexName)) return;
  if (dryRun) {
    console.log(`[supervision-migrate] would add index ${indexName}`);
    return;
  }
  await prisma.$executeRawUnsafe(
    `ALTER TABLE \`${tableName}\` ADD INDEX \`${indexName}\` (${columns})`,
  );
}

async function createProjectTable(dryRun) {
  if (await tableExists('supervision_projects')) return;
  if (dryRun) {
    console.log('[supervision-migrate] would create supervision_projects');
    return;
  }
  await prisma.$executeRawUnsafe(`
    CREATE TABLE \`supervision_projects\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`projectName\` VARCHAR(191) NOT NULL,
      \`projectType\` VARCHAR(191) NOT NULL DEFAULT 'MOLD',
      \`workOrderNumber\` VARCHAR(191) NULL,
      \`supplierName\` VARCHAR(191) NULL,
      \`location\` VARCHAR(191) NULL,
      \`supervisor\` VARCHAR(191) NULL,
      \`participants\` LONGTEXT NULL,
      \`plannedStartAt\` DATETIME(3) NULL,
      \`plannedEndAt\` DATETIME(3) NULL,
      \`actualStartAt\` DATETIME(3) NULL,
      \`actualEndAt\` DATETIME(3) NULL,
      \`stage\` VARCHAR(191) NULL,
      \`progressPercent\` INTEGER NOT NULL DEFAULT 0,
      \`status\` VARCHAR(191) NOT NULL DEFAULT 'PLANNED',
      \`riskLevel\` VARCHAR(191) NOT NULL DEFAULT 'LOW',
      \`summary\` TEXT NULL,
      \`isDeleted\` BOOLEAN NOT NULL DEFAULT false,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `);
}

async function createMilestoneTable(dryRun) {
  if (await tableExists('supervision_milestones')) return;
  if (dryRun) {
    console.log('[supervision-migrate] would create supervision_milestones');
    return;
  }
  await prisma.$executeRawUnsafe(`
    CREATE TABLE \`supervision_milestones\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`projectId\` VARCHAR(191) NOT NULL,
      \`name\` VARCHAR(191) NOT NULL,
      \`plannedAt\` DATETIME(3) NULL,
      \`actualAt\` DATETIME(3) NULL,
      \`status\` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
      \`delayReason\` TEXT NULL,
      \`acceptanceRecord\` LONGTEXT NULL,
      \`sortOrder\` INTEGER NOT NULL DEFAULT 0,
      \`isDeleted\` BOOLEAN NOT NULL DEFAULT false,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `);
}

async function createPlanRowTable(dryRun) {
  if (await tableExists('supervision_plan_rows')) return;
  if (dryRun) {
    console.log('[supervision-migrate] would create supervision_plan_rows');
    return;
  }
  await prisma.$executeRawUnsafe(`
    CREATE TABLE \`supervision_plan_rows\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`projectId\` VARCHAR(191) NOT NULL,
      \`segmentCode\` VARCHAR(191) NOT NULL,
      \`quantity\` INTEGER NOT NULL DEFAULT 1,
      \`unit\` VARCHAR(191) NOT NULL DEFAULT '套',
      \`remark\` TEXT NULL,
      \`isDeleted\` BOOLEAN NOT NULL DEFAULT false,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `);
}

async function createPlanStepTable(dryRun) {
  if (await tableExists('supervision_plan_steps')) return;
  if (dryRun) {
    console.log('[supervision-migrate] would create supervision_plan_steps');
    return;
  }
  await prisma.$executeRawUnsafe(`
    CREATE TABLE \`supervision_plan_steps\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`rowId\` VARCHAR(191) NOT NULL,
      \`stepName\` VARCHAR(191) NOT NULL,
      \`plannedAt\` DATETIME(3) NULL,
      \`actualAt\` DATETIME(3) NULL,
      \`status\` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
      \`remark\` TEXT NULL,
      \`sortOrder\` INTEGER NOT NULL DEFAULT 0,
      \`isDeleted\` BOOLEAN NOT NULL DEFAULT false,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `);
}

async function createPlanTaskTable(dryRun) {
  if (await tableExists('supervision_plan_tasks')) return;
  if (dryRun) {
    console.log('[supervision-migrate] would create supervision_plan_tasks');
    return;
  }
  await prisma.$executeRawUnsafe(`
    CREATE TABLE \`supervision_plan_tasks\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`projectId\` VARCHAR(191) NOT NULL,
      \`taskNo\` VARCHAR(191) NOT NULL,
      \`taskName\` VARCHAR(191) NOT NULL,
      \`durationText\` VARCHAR(191) NULL,
      \`durationDays\` INTEGER NULL,
      \`plannedStartAt\` DATETIME(3) NULL,
      \`plannedEndAt\` DATETIME(3) NULL,
      \`actualStartAt\` DATETIME(3) NULL,
      \`actualEndAt\` DATETIME(3) NULL,
      \`progressPercent\` INTEGER NOT NULL DEFAULT 0,
      \`plannedQuantity\` DECIMAL(12, 2) NOT NULL DEFAULT 1.00,
      \`completedQuantity\` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
      \`quantityUnit\` VARCHAR(191) NOT NULL DEFAULT '项',
      \`weight\` DECIMAL(10, 2) NOT NULL DEFAULT 1.00,
      \`predecessorText\` VARCHAR(191) NULL,
      \`resourceName\` VARCHAR(191) NULL,
      \`status\` VARCHAR(191) NOT NULL DEFAULT 'NOT_STARTED',
      \`riskLevel\` VARCHAR(191) NOT NULL DEFAULT 'NORMAL',
      \`riskReason\` TEXT NULL,
      \`lastReportAt\` DATETIME(3) NULL,
      \`lastReportId\` VARCHAR(191) NULL,
      \`sourceFileName\` VARCHAR(191) NULL,
      \`sourceFileUrl\` TEXT NULL,
      \`sortOrder\` INTEGER NOT NULL DEFAULT 0,
      \`isDeleted\` BOOLEAN NOT NULL DEFAULT false,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `);
}

async function createReportTaskUpdateTable(dryRun) {
  if (await tableExists('supervision_report_task_updates')) return;
  if (dryRun) {
    console.log(
      '[supervision-migrate] would create supervision_report_task_updates',
    );
    return;
  }
  await prisma.$executeRawUnsafe(`
    CREATE TABLE \`supervision_report_task_updates\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`reportId\` VARCHAR(191) NOT NULL,
      \`projectId\` VARCHAR(191) NOT NULL,
      \`taskId\` VARCHAR(191) NOT NULL,
      \`taskNo\` VARCHAR(191) NOT NULL,
      \`taskName\` VARCHAR(191) NOT NULL,
      \`progressPercent\` INTEGER NOT NULL DEFAULT 0,
      \`plannedQuantity\` DECIMAL(12, 2) NOT NULL DEFAULT 1.00,
      \`completedQuantity\` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
      \`dailyQuantity\` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
      \`quantityUnit\` VARCHAR(191) NOT NULL DEFAULT '项',
      \`status\` VARCHAR(191) NOT NULL DEFAULT 'IN_PROGRESS',
      \`riskReason\` TEXT NULL,
      \`workContent\` TEXT NULL,
      \`nextPlan\` TEXT NULL,
      \`photos\` LONGTEXT NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `);
}

async function createReportTable(dryRun) {
  if (await tableExists('supervision_daily_reports')) return;
  if (dryRun) {
    console.log('[supervision-migrate] would create supervision_daily_reports');
    return;
  }
  await prisma.$executeRawUnsafe(`
    CREATE TABLE \`supervision_daily_reports\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`projectId\` VARCHAR(191) NOT NULL,
      \`reportDate\` DATETIME(3) NOT NULL,
      \`reporter\` VARCHAR(191) NOT NULL,
      \`location\` VARCHAR(191) NULL,
      \`progressPercent\` INTEGER NOT NULL DEFAULT 0,
      \`completedMilestone\` VARCHAR(191) NULL,
      \`workContent\` TEXT NULL,
      \`issueSummary\` TEXT NULL,
      \`tomorrowPlan\` TEXT NULL,
      \`coordinationNeeded\` TEXT NULL,
      \`manpower\` INTEGER NOT NULL DEFAULT 0,
      \`weather\` VARCHAR(191) NULL,
      \`attachments\` LONGTEXT NULL,
      \`isDeleted\` BOOLEAN NOT NULL DEFAULT false,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `);
}

async function createIssueTable(dryRun) {
  if (await tableExists('supervision_issues')) return;
  if (dryRun) {
    console.log('[supervision-migrate] would create supervision_issues');
    return;
  }
  await prisma.$executeRawUnsafe(`
    CREATE TABLE \`supervision_issues\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`projectId\` VARCHAR(191) NOT NULL,
      \`issueNo\` VARCHAR(191) NOT NULL,
      \`issueType\` VARCHAR(191) NOT NULL DEFAULT 'QUALITY',
      \`description\` TEXT NOT NULL,
      \`responsibleUnit\` VARCHAR(191) NULL,
      \`severity\` VARCHAR(191) NOT NULL DEFAULT 'minor',
      \`status\` VARCHAR(191) NOT NULL DEFAULT 'OPEN',
      \`affectsProgress\` BOOLEAN NOT NULL DEFAULT false,
      \`isClaim\` BOOLEAN NOT NULL DEFAULT false,
      \`estimatedLoss\` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
      \`correctiveAction\` TEXT NULL,
      \`dueAt\` DATETIME(3) NULL,
      \`closedAt\` DATETIME(3) NULL,
      \`verifyResult\` TEXT NULL,
      \`photos\` LONGTEXT NULL,
      \`rectificationPhotos\` LONGTEXT NULL,
      \`createdBy\` VARCHAR(191) NULL,
      \`isDeleted\` BOOLEAN NOT NULL DEFAULT false,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      UNIQUE INDEX \`supervision_issues_issueNo_key\`(\`issueNo\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `);
}

async function createIssueActionTable(dryRun) {
  if (await tableExists('supervision_issue_actions')) return;
  if (dryRun) {
    console.log('[supervision-migrate] would create supervision_issue_actions');
    return;
  }
  await prisma.$executeRawUnsafe(`
    CREATE TABLE \`supervision_issue_actions\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`issueId\` VARCHAR(191) NOT NULL,
      \`actionType\` VARCHAR(191) NOT NULL DEFAULT 'FOLLOW_UP',
      \`description\` TEXT NULL,
      \`attachments\` LONGTEXT NULL,
      \`createdBy\` VARCHAR(191) NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `);
}

async function addIndexes(dryRun) {
  await addIndex(
    'supervision_projects',
    'supervision_projects_projectName_idx',
    '`projectName`',
    dryRun,
  );
  await addIndex(
    'supervision_projects',
    'supervision_projects_projectType_idx',
    '`projectType`',
    dryRun,
  );
  await addIndex(
    'supervision_projects',
    'supervision_projects_workOrderNumber_idx',
    '`workOrderNumber`',
    dryRun,
  );
  await addIndex(
    'supervision_projects',
    'supervision_projects_supplierName_idx',
    '`supplierName`',
    dryRun,
  );
  await addIndex(
    'supervision_projects',
    'supervision_projects_status_idx',
    '`status`',
    dryRun,
  );
  await addIndex(
    'supervision_projects',
    'supervision_projects_riskLevel_idx',
    '`riskLevel`',
    dryRun,
  );
  await addIndex(
    'supervision_projects',
    'supervision_projects_isDeleted_idx',
    '`isDeleted`',
    dryRun,
  );
  await addIndex(
    'supervision_milestones',
    'supervision_milestones_projectId_idx',
    '`projectId`',
    dryRun,
  );
  await addIndex(
    'supervision_milestones',
    'supervision_milestones_status_idx',
    '`status`',
    dryRun,
  );
  await addIndex(
    'supervision_milestones',
    'supervision_milestones_plannedAt_idx',
    '`plannedAt`',
    dryRun,
  );
  await addIndex(
    'supervision_plan_rows',
    'supervision_plan_rows_projectId_idx',
    '`projectId`',
    dryRun,
  );
  await addIndex(
    'supervision_plan_rows',
    'supervision_plan_rows_segmentCode_idx',
    '`segmentCode`',
    dryRun,
  );
  await addIndex(
    'supervision_plan_rows',
    'supervision_plan_rows_isDeleted_idx',
    '`isDeleted`',
    dryRun,
  );
  await addIndex(
    'supervision_plan_steps',
    'supervision_plan_steps_rowId_idx',
    '`rowId`',
    dryRun,
  );
  await addIndex(
    'supervision_plan_steps',
    'supervision_plan_steps_stepName_idx',
    '`stepName`',
    dryRun,
  );
  await addIndex(
    'supervision_plan_steps',
    'supervision_plan_steps_plannedAt_idx',
    '`plannedAt`',
    dryRun,
  );
  await addIndex(
    'supervision_plan_steps',
    'supervision_plan_steps_status_idx',
    '`status`',
    dryRun,
  );
  await addIndex(
    'supervision_plan_steps',
    'supervision_plan_steps_isDeleted_idx',
    '`isDeleted`',
    dryRun,
  );
  await addIndex(
    'supervision_plan_tasks',
    'supervision_plan_tasks_projectId_idx',
    '`projectId`',
    dryRun,
  );
  await addIndex(
    'supervision_plan_tasks',
    'supervision_plan_tasks_taskNo_idx',
    '`taskNo`',
    dryRun,
  );
  await addIndex(
    'supervision_plan_tasks',
    'supervision_plan_tasks_plannedStartAt_idx',
    '`plannedStartAt`',
    dryRun,
  );
  await addIndex(
    'supervision_plan_tasks',
    'supervision_plan_tasks_plannedEndAt_idx',
    '`plannedEndAt`',
    dryRun,
  );
  await addIndex(
    'supervision_plan_tasks',
    'supervision_plan_tasks_status_idx',
    '`status`',
    dryRun,
  );
  await addIndex(
    'supervision_plan_tasks',
    'supervision_plan_tasks_riskLevel_idx',
    '`riskLevel`',
    dryRun,
  );
  await addIndex(
    'supervision_plan_tasks',
    'supervision_plan_tasks_lastReportAt_idx',
    '`lastReportAt`',
    dryRun,
  );
  await addIndex(
    'supervision_plan_tasks',
    'supervision_plan_tasks_isDeleted_idx',
    '`isDeleted`',
    dryRun,
  );
  await addIndex(
    'supervision_report_task_updates',
    'supervision_report_task_updates_reportId_idx',
    '`reportId`',
    dryRun,
  );
  await addIndex(
    'supervision_report_task_updates',
    'supervision_report_task_updates_projectId_idx',
    '`projectId`',
    dryRun,
  );
  await addIndex(
    'supervision_report_task_updates',
    'supervision_report_task_updates_taskId_idx',
    '`taskId`',
    dryRun,
  );
  await addIndex(
    'supervision_report_task_updates',
    'supervision_report_task_updates_status_idx',
    '`status`',
    dryRun,
  );
  await addIndex(
    'supervision_report_task_updates',
    'supervision_report_task_updates_createdAt_idx',
    '`createdAt`',
    dryRun,
  );
  await addIndex(
    'supervision_daily_reports',
    'supervision_daily_reports_projectId_idx',
    '`projectId`',
    dryRun,
  );
  await addIndex(
    'supervision_daily_reports',
    'supervision_daily_reports_reportDate_idx',
    '`reportDate`',
    dryRun,
  );
  await addIndex(
    'supervision_daily_reports',
    'supervision_daily_reports_reporter_idx',
    '`reporter`',
    dryRun,
  );
  await addIndex(
    'supervision_daily_reports',
    'supervision_daily_reports_isDeleted_idx',
    '`isDeleted`',
    dryRun,
  );
  await addIndex(
    'supervision_issues',
    'supervision_issues_projectId_idx',
    '`projectId`',
    dryRun,
  );
  await addIndex(
    'supervision_issues',
    'supervision_issues_issueType_idx',
    '`issueType`',
    dryRun,
  );
  await addIndex(
    'supervision_issues',
    'supervision_issues_status_idx',
    '`status`',
    dryRun,
  );
  await addIndex(
    'supervision_issues',
    'supervision_issues_severity_idx',
    '`severity`',
    dryRun,
  );
  await addIndex(
    'supervision_issues',
    'supervision_issues_dueAt_idx',
    '`dueAt`',
    dryRun,
  );
  await addIndex(
    'supervision_issues',
    'supervision_issues_isClaim_idx',
    '`isClaim`',
    dryRun,
  );
  await addIndex(
    'supervision_issues',
    'supervision_issues_isDeleted_idx',
    '`isDeleted`',
    dryRun,
  );
  await addIndex(
    'supervision_issues',
    'supervision_issues_taskId_idx',
    '`taskId`',
    dryRun,
  );
  await addIndex(
    'supervision_plan_tasks',
    'supervision_plan_tasks_parentId_idx',
    '`parentId`',
    dryRun,
  );
  await addIndex(
    'supervision_plan_tasks',
    'supervision_plan_tasks_outlineLevel_idx',
    '`outlineLevel`',
    dryRun,
  );
  await addIndex(
    'supervision_issue_actions',
    'supervision_issue_actions_issueId_idx',
    '`issueId`',
    dryRun,
  );
  await addIndex(
    'supervision_issue_actions',
    'supervision_issue_actions_actionType_idx',
    '`actionType`',
    dryRun,
  );
  await addIndex(
    'supervision_issue_actions',
    'supervision_issue_actions_createdAt_idx',
    '`createdAt`',
    dryRun,
  );
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  console.log(`[supervision-migrate] start${dryRun ? ' (dry-run)' : ''}`);

  await createProjectTable(dryRun);
  await createMilestoneTable(dryRun);
  await createPlanRowTable(dryRun);
  await createPlanStepTable(dryRun);
  await createPlanTaskTable(dryRun);
  await createReportTaskUpdateTable(dryRun);
  await createReportTable(dryRun);
  await createIssueTable(dryRun);
  await createIssueActionTable(dryRun);
  await addColumn(
    'supervision_projects',
    'projectType',
    "VARCHAR(191) NOT NULL DEFAULT 'MOLD'",
    dryRun,
  );
  await addColumn(
    'supervision_plan_tasks',
    'actualStartAt',
    'DATETIME(3) NULL',
    dryRun,
  );
  await addColumn(
    'supervision_plan_tasks',
    'actualEndAt',
    'DATETIME(3) NULL',
    dryRun,
  );
  await addColumn(
    'supervision_plan_tasks',
    'riskLevel',
    "VARCHAR(191) NOT NULL DEFAULT 'NORMAL'",
    dryRun,
  );
  await addColumn('supervision_plan_tasks', 'riskReason', 'TEXT NULL', dryRun);
  await addColumn(
    'supervision_plan_tasks',
    'plannedQuantity',
    'DECIMAL(12, 2) NOT NULL DEFAULT 1.00',
    dryRun,
  );
  await addColumn(
    'supervision_plan_tasks',
    'completedQuantity',
    'DECIMAL(12, 2) NOT NULL DEFAULT 0.00',
    dryRun,
  );
  await addColumn(
    'supervision_plan_tasks',
    'quantityUnit',
    "VARCHAR(191) NOT NULL DEFAULT '项'",
    dryRun,
  );
  await addColumn(
    'supervision_plan_tasks',
    'weight',
    'DECIMAL(10, 2) NOT NULL DEFAULT 1.00',
    dryRun,
  );
  await addColumn(
    'supervision_report_task_updates',
    'plannedQuantity',
    'DECIMAL(12, 2) NOT NULL DEFAULT 1.00',
    dryRun,
  );
  await addColumn(
    'supervision_report_task_updates',
    'completedQuantity',
    'DECIMAL(12, 2) NOT NULL DEFAULT 0.00',
    dryRun,
  );
  await addColumn(
    'supervision_report_task_updates',
    'dailyQuantity',
    'DECIMAL(12, 2) NOT NULL DEFAULT 0.00',
    dryRun,
  );
  await addColumn(
    'supervision_report_task_updates',
    'quantityUnit',
    "VARCHAR(191) NOT NULL DEFAULT '项'",
    dryRun,
  );
  await addColumn(
    'supervision_plan_tasks',
    'lastReportAt',
    'DATETIME(3) NULL',
    dryRun,
  );
  await addColumn(
    'supervision_plan_tasks',
    'lastReportId',
    'VARCHAR(191) NULL',
    dryRun,
  );
  await addColumn(
    'supervision_plan_tasks',
    'parentId',
    'VARCHAR(191) NULL',
    dryRun,
  );
  await addColumn(
    'supervision_plan_tasks',
    'outlineLevel',
    'INTEGER NOT NULL DEFAULT 1',
    dryRun,
  );
  await addColumn(
    'supervision_plan_tasks',
    'outlineNumber',
    'VARCHAR(191) NULL',
    dryRun,
  );
  await addColumn(
    'supervision_plan_tasks',
    'isSummary',
    'BOOLEAN NOT NULL DEFAULT false',
    dryRun,
  );
  await addColumn(
    'supervision_issues',
    'taskId',
    'VARCHAR(191) NULL',
    dryRun,
  );
  await addIndexes(dryRun);

  console.log('[supervision-migrate] done');
}

main()
  .catch((error) => {
    console.error('[supervision-migrate] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
