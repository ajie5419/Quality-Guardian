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

  throw new Error('Unable to resolve @prisma/client for file center migration');
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

async function addIndex(tableName, indexName, columns) {
  if (await indexExists(tableName, indexName)) return;
  await prisma.$executeRawUnsafe(
    `ALTER TABLE \`${tableName}\` ADD INDEX \`${indexName}\` (${columns})`,
  );
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  console.log(`[file-center-migrate] start${dryRun ? ' (dry-run)' : ''}`);

  if (!(await tableExists('file_assets'))) {
    if (dryRun) {
      console.log('[file-center-migrate] would create file_assets');
    } else {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE \`file_assets\` (
          \`id\` VARCHAR(191) NOT NULL,
          \`storageProvider\` VARCHAR(191) NOT NULL DEFAULT 'LOCAL',
          \`bucket\` VARCHAR(191) NULL,
          \`objectKey\` VARCHAR(191) NOT NULL,
          \`originalName\` VARCHAR(191) NOT NULL,
          \`storedName\` VARCHAR(191) NOT NULL,
          \`mimeType\` VARCHAR(191) NOT NULL,
          \`size\` INTEGER NOT NULL,
          \`sha256\` VARCHAR(191) NOT NULL,
          \`url\` VARCHAR(191) NOT NULL,
          \`thumbObjectKey\` VARCHAR(191) NULL,
          \`thumbUrl\` VARCHAR(191) NULL,
          \`status\` ENUM('ACTIVE','DELETED','MISSING') NOT NULL DEFAULT 'ACTIVE',
          \`uploadedBy\` VARCHAR(191) NULL,
          \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
          \`deletedAt\` DATETIME(3) NULL,
          PRIMARY KEY (\`id\`)
        ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
      `);
    }
  }

  if (!(await tableExists('file_references'))) {
    if (dryRun) {
      console.log('[file-center-migrate] would create file_references');
    } else {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE \`file_references\` (
          \`id\` VARCHAR(191) NOT NULL,
          \`fileId\` VARCHAR(191) NOT NULL,
          \`bizType\` VARCHAR(191) NOT NULL,
          \`bizId\` VARCHAR(191) NOT NULL,
          \`fieldName\` VARCHAR(191) NOT NULL DEFAULT 'attachments',
          \`sortOrder\` INTEGER NOT NULL DEFAULT 0,
          \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          PRIMARY KEY (\`id\`)
        ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
      `);
      await prisma.$executeRawUnsafe(
        'ALTER TABLE `file_references` ADD CONSTRAINT `file_references_fileId_fkey` FOREIGN KEY (`fileId`) REFERENCES `file_assets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE',
      );
    }
  }

  if (!dryRun) {
    await addIndex(
      'file_assets',
      'file_assets_storageProvider_idx',
      '`storageProvider`',
    );
    await addIndex('file_assets', 'file_assets_objectKey_idx', '`objectKey`');
    await addIndex('file_assets', 'file_assets_sha256_idx', '`sha256`');
    await addIndex('file_assets', 'file_assets_status_idx', '`status`');
    await addIndex('file_assets', 'file_assets_uploadedBy_idx', '`uploadedBy`');
    await addIndex('file_references', 'file_references_fileId_idx', '`fileId`');
    await addIndex(
      'file_references',
      'file_references_bizType_bizId_idx',
      '`bizType`, `bizId`',
    );
    await addIndex(
      'file_references',
      'file_references_fieldName_idx',
      '`fieldName`',
    );
  }

  console.log('[file-center-migrate] done');
}

main()
  .catch((error) => {
    console.error('[file-center-migrate] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
