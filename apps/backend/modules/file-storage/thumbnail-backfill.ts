import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { createModuleLogger } from '~/utils/logger';
import { UPLOAD_DIR } from '~/utils/paths';
import prisma from '~/utils/prisma';

import { putOssObject } from './oss-storage';
import {
  buildThumbnail,
  createThumbnailStoredName,
  getStorageStrategyForProvider,
  normalizeStorageProvider,
} from './storage-strategy';

const logger = createModuleLogger('thumbnail-backfill');

const DEFAULT_BATCH_SIZE = 20;
// Skip oversized sources: decoding them with sharp could exhaust the
// 2-core / 4GB production host.
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;

export interface ThumbnailBackfillResult {
  failed: number;
  generated: number;
  processed: number;
  skipped: number;
}

// The thumbnail must live next to the original object key (which embeds the
// original upload year/month), so derive it from objectKey instead of
// rebuilding a key from today's date.
function deriveThumbObjectKey(objectKey: string, storedName: string) {
  const thumbName = createThumbnailStoredName(storedName);
  const index = objectKey.lastIndexOf(storedName);
  if (index === -1) return thumbName;
  return objectKey.slice(0, index) + thumbName;
}

export async function backfillMissingThumbnails(
  options: { batchSize?: number; dryRun?: boolean } = {},
): Promise<ThumbnailBackfillResult> {
  const batchSize = options.batchSize || DEFAULT_BATCH_SIZE;
  const dryRun = options.dryRun === true;
  const result: ThumbnailBackfillResult = {
    failed: 0,
    generated: 0,
    processed: 0,
    skipped: 0,
  };

  let cursor: string | undefined;
  for (;;) {
    const files = await prisma.file_assets.findMany({
      where: {
        mimeType: { startsWith: 'image/' },
        status: 'ACTIVE',
        thumbObjectKey: null,
      },
      orderBy: { id: 'asc' },
      take: batchSize,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        mimeType: true,
        objectKey: true,
        size: true,
        storageProvider: true,
        storedName: true,
      },
    });
    if (files.length === 0) break;
    cursor = files.at(-1)?.id;

    for (const file of files) {
      result.processed += 1;
      try {
        if (file.size > MAX_SOURCE_BYTES) {
          result.skipped += 1;
          continue;
        }

        const provider = normalizeStorageProvider(file.storageProvider);
        const strategy = getStorageStrategyForProvider(provider);
        const source = await strategy.download(file.objectKey);
        const thumbBuffer = await buildThumbnail(source, file.mimeType);
        if (!thumbBuffer) {
          result.skipped += 1;
          continue;
        }

        const thumbObjectKey =
          provider === 'OSS'
            ? deriveThumbObjectKey(file.objectKey, file.storedName)
            : createThumbnailStoredName(file.storedName);
        const thumbUrl = strategy.getThumbUrl(file.storedName, thumbObjectKey);

        if (!dryRun) {
          await (provider === 'OSS'
            ? putOssObject(thumbObjectKey, thumbBuffer, 'image/webp')
            : writeFile(join(UPLOAD_DIR, thumbObjectKey), thumbBuffer));
          await prisma.file_assets.update({
            data: { thumbObjectKey, thumbUrl: thumbUrl || null },
            where: { id: file.id },
          });
        }

        result.generated += 1;
        logger.info(
          { dryRun, fileId: file.id, size: file.size, thumbObjectKey },
          'thumbnail generated',
        );
      } catch (error) {
        result.failed += 1;
        logger.error(
          { err: error, fileId: file.id, objectKey: file.objectKey },
          'thumbnail backfill failed for file',
        );
      }
    }
  }

  return result;
}
