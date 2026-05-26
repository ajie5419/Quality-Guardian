import type {
  StorageStrategy,
  StoredFileResult,
  UploadStreamOptions,
} from './storage-strategy';

import { Buffer } from 'node:buffer';
import process from 'node:process';
import { Readable } from 'node:stream';

import OSS from 'ali-oss';

import {
  buildThumbnail,
  createThumbnailStoredName,
  createUploadProbe,
  getLegacyOssProxyName,
} from './storage-strategy';

let ossClientInstance: null | OSS = null;

function buildOssObjectKey(storedName: string) {
  const prefix = String(process.env.OSS_PREFIX || 'qms')
    .replaceAll(/^\/+|\/+$/g, '')
    .trim();
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return [prefix, 'uploads', String(year), month, storedName]
    .filter(Boolean)
    .join('/');
}

function createOssClient() {
  return new OSS({
    accessKeyId: process.env.OSS_ACCESS_KEY_ID || '',
    accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET || '',
    bucket: process.env.OSS_BUCKET || '',
    endpoint: process.env.OSS_ENDPOINT,
    region: process.env.OSS_REGION,
    secure: true,
  });
}

function getOssClient() {
  if (!ossClientInstance) {
    ossClientInstance = createOssClient();
  }
  return ossClientInstance;
}

export class OssStorageStrategy implements StorageStrategy {
  async delete(storedName: string) {
    await getOssClient().delete(storedName);
  }

  async download(storedName: string) {
    const result = await getOssClient().get(storedName);
    const content = result.content;
    return Buffer.isBuffer(content) ? content : Buffer.from(content);
  }

  async exists(storedName: string) {
    try {
      await getOssClient().head(storedName);
      return true;
    } catch {
      return false;
    }
  }

  getThumbUrl(storedName: string, thumbObjectKey?: string) {
    if (!thumbObjectKey) return '';
    return `/api/uploads/${getLegacyOssProxyName(
      createThumbnailStoredName(storedName),
    )}`;
  }

  getUrl(storedName: string) {
    return `/api/uploads/${getLegacyOssProxyName(storedName)}`;
  }

  async upload(storedName: string, data: Buffer) {
    const objectKey = buildOssObjectKey(storedName);
    await getOssClient().put(objectKey, data);
    return this.getUrl(storedName);
  }

  async uploadStream(options: UploadStreamOptions): Promise<StoredFileResult> {
    const client = getOssClient();
    const objectKey = buildOssObjectKey(options.storedName);
    const probe = createUploadProbe({
      maxThumbnailSourceBytes: options.maxThumbnailSourceBytes,
      maxUploadBytes: options.maxUploadBytes,
    });

    const uploadStream = Readable.from(options.stream).pipe(probe.stream);
    await client.putStream(objectKey, uploadStream, {
      headers: { 'Content-Type': options.mimeType },
    });

    const measured = probe.summary();
    const thumbBuffer = measured.thumbSource
      ? await buildThumbnail(measured.thumbSource, options.mimeType)
      : null;

    let thumbObjectKey: string | undefined;
    if (thumbBuffer) {
      thumbObjectKey = buildOssObjectKey(
        createThumbnailStoredName(options.storedName),
      );
      await client.put(thumbObjectKey, thumbBuffer, {
        headers: { 'Content-Type': 'image/webp' },
      });
    }

    return {
      bucket: process.env.OSS_BUCKET,
      objectKey,
      sha256: measured.sha256,
      size: measured.size,
      storageProvider: 'OSS',
      storedName: options.storedName,
      thumbObjectKey,
      url: this.getUrl(options.storedName),
    };
  }
}
