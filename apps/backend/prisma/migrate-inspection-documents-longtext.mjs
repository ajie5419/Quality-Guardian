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
    'Unable to resolve @prisma/client for inspection documents migration',
  );
}

const { PrismaClient } = loadPrismaClient();
const prisma = new PrismaClient();

async function getColumnType(tableName, columnName) {
  const rows = await prisma.$queryRawUnsafe(
    'SELECT DATA_TYPE, COLUMN_TYPE, IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
    tableName,
    columnName,
  );

  return rows[0] || null;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  console.log(
    `[inspection-documents-longtext] start${dryRun ? ' (dry-run)' : ''}`,
  );

  const column = await getColumnType('inspections', 'documents');
  if (!column) {
    throw new Error('inspections.documents column does not exist');
  }

  const dataType = String(column.DATA_TYPE || '').toLowerCase();
  if (dataType === 'longtext') {
    console.log('[inspection-documents-longtext] already longtext');
    return;
  }

  if (dryRun) {
    console.log(
      `[inspection-documents-longtext] would change inspections.documents from ${column.COLUMN_TYPE} to LONGTEXT NULL`,
    );
    return;
  }

  await prisma.$executeRawUnsafe(
    'ALTER TABLE `inspections` MODIFY COLUMN `documents` LONGTEXT NULL',
  );
  console.log('[inspection-documents-longtext] done');
}

main()
  .catch((error) => {
    console.error('[inspection-documents-longtext] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
