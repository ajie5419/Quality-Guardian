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
    'Unable to resolve @prisma/client for audit log user agent migration',
  );
}

const { PrismaClient } = loadPrismaClient();
const prisma = new PrismaClient();

async function getColumnType(tableName, columnName) {
  const rows = await prisma.$queryRawUnsafe(
    'SELECT DATA_TYPE, COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
    tableName,
    columnName,
  );

  return rows[0] || null;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  console.log(`[audit-log-user-agent] start${dryRun ? ' (dry-run)' : ''}`);

  const column = await getColumnType('audit_logs', 'userAgent');
  if (!column) {
    throw new Error('audit_logs.userAgent column does not exist');
  }

  const dataType = String(column.DATA_TYPE || '').toLowerCase();
  if (['longtext', 'mediumtext', 'text'].includes(dataType)) {
    console.log(`[audit-log-user-agent] already ${dataType}`);
    return;
  }

  if (dryRun) {
    console.log(
      `[audit-log-user-agent] would change audit_logs.userAgent from ${column.COLUMN_TYPE} to TEXT NULL`,
    );
    return;
  }

  await prisma.$executeRawUnsafe(
    'ALTER TABLE `audit_logs` MODIFY COLUMN `userAgent` TEXT NULL',
  );
  console.log('[audit-log-user-agent] done');
}

main()
  .catch((error) => {
    console.error('[audit-log-user-agent] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
