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

  throw new Error('Unable to resolve @prisma/client for BOM migration');
}

const { PrismaClient } = loadPrismaClient();
const prisma = new PrismaClient();

async function columnExists(tableName, columnName) {
  const rows = await prisma.$queryRawUnsafe(
    'SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
    tableName,
    columnName,
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

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  console.log(
    `[bom-inspection-processes-migrate] start${dryRun ? ' (dry-run)' : ''}`,
  );

  if (!(await columnExists('project_boms', 'required_processes'))) {
    if (dryRun) {
      console.log(
        '[bom-inspection-processes-migrate] would add project_boms.required_processes',
      );
    } else {
      await prisma.$executeRawUnsafe(
        'ALTER TABLE `project_boms` ADD COLUMN `required_processes` LONGTEXT NULL AFTER `part_number`',
      );
    }
  }

  if (await columnExists('project_boms', 'material')) {
    if (dryRun) {
      console.log(
        '[bom-inspection-processes-migrate] would drop project_boms.material',
      );
    } else {
      await prisma.$executeRawUnsafe(
        'ALTER TABLE `project_boms` DROP COLUMN `material`',
      );
    }
  }

  if (!(await indexExists('project_boms', 'project_boms_part_number_idx'))) {
    if (dryRun) {
      console.log(
        '[bom-inspection-processes-migrate] would add project_boms_part_number_idx',
      );
    } else {
      await prisma.$executeRawUnsafe(
        'ALTER TABLE `project_boms` ADD INDEX `project_boms_part_number_idx` (`part_number`)',
      );
    }
  }

  console.log('[bom-inspection-processes-migrate] done');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
