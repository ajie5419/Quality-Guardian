import type {
  StorageStrategy,
  StoredFileResult,
  UploadStreamOptions,
} from './storage-strategy';

import { Buffer } from 'node:buffer';
import { createWriteStream, existsSync } from 'node:fs';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';

import { UPLOAD_DIR } from '~/utils/paths';

import {
  buildThumbnail,
  createThumbnailStoredName,
  createUploadProbe,
} from './storage-strategy';

export class LocalStorageStrategy implements StorageStrategy {
  async delete(storedName: string) {
    await unlink(join(UPLOAD_DIR, storedName)).catch(() => undefined);
  }

  async download(storedName: string) {
    return readFile(join(UPLOAD_DIR, storedName));
  }

  async exists(storedName: string) {
    return existsSync(join(UPLOAD_DIR, storedName));
  }

  getThumbUrl(_storedName: string, thumbObjectKey?: string) {
    return thumbObjectKey ? `/uploads/${thumbObjectKey}` : '';
  }

  getUrl(storedName: string) {
    return `/uploads/${storedName}`;
  }

  async upload(storedName: string, data: Buffer) {
    if (!existsSync(UPLOAD_DIR)) {
      await mkdir(UPLOAD_DIR, { recursive: true });
    }
    await writeFile(join(UPLOAD_DIR, storedName), data);
    return this.getUrl(storedName);
  }

  async uploadStream(options: UploadStreamOptions): Promise<StoredFileResult> {
    if (!existsSync(UPLOAD_DIR)) {
      await mkdir(UPLOAD_DIR, { recursive: true });
    }

    const filePath = join(UPLOAD_DIR, options.storedName);
    const writer = createWriteStream(filePath);
    const probe = createUploadProbe({
      maxThumbnailSourceBytes: options.maxThumbnailSourceBytes,
      maxUploadBytes: options.maxUploadBytes,
    });
    try {
      await pipeline(options.stream, probe.stream, writer);
    } catch (error) {
      await unlink(filePath).catch(() => undefined);
      throw error;
    }

    const measured = probe.summary();
    const thumbBuffer = measured.thumbSource
      ? await buildThumbnail(measured.thumbSource, options.mimeType)
      : null;

    let thumbObjectKey: string | undefined;
    let thumbUrl: string | undefined;
    if (thumbBuffer) {
      thumbObjectKey = createThumbnailStoredName(options.storedName);
      thumbUrl = this.getThumbUrl(options.storedName, thumbObjectKey);
      await writeFile(join(UPLOAD_DIR, thumbObjectKey), thumbBuffer);
    }

    return {
      objectKey: options.storedName,
      sha256: measured.sha256,
      size: measured.size,
      storageProvider: 'LOCAL',
      storedName: options.storedName,
      thumbObjectKey,
      thumbUrl,
      url: this.getUrl(options.storedName),
    };
  }
}
