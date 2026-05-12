/* eslint-disable no-console */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { basename, extname, join, resolve } from 'node:path';
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

  throw new Error('Unable to resolve @prisma/client for local file register');
}

const { PrismaClient } = loadPrismaClient();
const prisma = new PrismaClient();

const MIME_TYPES = {
  '.bmp': 'image/bmp',
  '.doc': 'application/msword',
  '.docx':
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

function getUploadDir() {
  return process.env.UPLOAD_DIR || resolve(process.cwd(), 'uploads');
}

function getMimeType(filename) {
  return (
    MIME_TYPES[extname(filename).toLowerCase()] || 'application/octet-stream'
  );
}

function getSourceName(filename) {
  return filename.endsWith('_thumb.webp')
    ? filename.slice(0, -'_thumb.webp'.length)
    : filename;
}

async function fileHash(filePath) {
  const { readFile } = await import('node:fs/promises');
  return createHash('sha256')
    .update(await readFile(filePath))
    .digest('hex');
}

async function main() {
  const uploadDir = getUploadDir();
  const dryRun = process.argv.includes('--dry-run');
  console.log(
    `[register-local-files] start dir=${uploadDir}${dryRun ? ' (dry-run)' : ''}`,
  );

  if (!existsSync(uploadDir)) {
    console.log('[register-local-files] upload directory does not exist');
    return;
  }

  const uploadDirEntries = await readdir(uploadDir);
  const filenames = uploadDirEntries.filter(
    (name) => !name.endsWith('_thumb.webp'),
  );
  let created = 0;
  let skipped = 0;

  for (const filename of filenames) {
    const filePath = join(uploadDir, filename);
    const info = await stat(filePath);
    if (!info.isFile()) {
      skipped++;
      continue;
    }

    const existing = await prisma.file_assets.findFirst({
      where: {
        objectKey: filename,
        storageProvider: 'LOCAL',
      },
    });
    if (existing) {
      skipped++;
      continue;
    }

    const thumbName = `${getSourceName(filename)}_thumb.webp`;
    const hasThumb = existsSync(join(uploadDir, thumbName));
    const data = {
      mimeType: getMimeType(filename),
      objectKey: filename,
      originalName: basename(filename),
      sha256: await fileHash(filePath),
      size: info.size,
      status: 'ACTIVE',
      storageProvider: 'LOCAL',
      storedName: filename,
      thumbObjectKey: hasThumb ? thumbName : null,
      thumbUrl: hasThumb ? `/uploads/${thumbName}` : null,
      url: `/uploads/${filename}`,
    };

    if (dryRun) {
      console.log(`[register-local-files] would register ${filename}`);
    } else {
      await prisma.file_assets.create({ data });
    }
    created++;
  }

  console.log(
    `[register-local-files] done created=${created} skipped=${skipped}`,
  );
}

main()
  .catch((error) => {
    console.error('[register-local-files] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
