import type { Readable } from 'node:stream';

import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import process from 'node:process';
import { Transform } from 'node:stream';

import sharp from 'sharp';
import { logApiError } from '~/utils/api-logger';

import { LocalStorageStrategy } from './local-storage';
import { OssStorageStrategy } from './oss-storage';

export type StorageProvider = 'LOCAL' | 'OSS';

export type StoredFileResult = {
  bucket?: string;
  objectKey: string;
  sha256: string;
  size: number;
  storageProvider: StorageProvider;
  storedName: string;
  thumbObjectKey?: string;
  thumbUrl?: string;
  url: string;
};

export type UploadStreamOptions = {
  maxThumbnailSourceBytes: number;
  maxUploadBytes: number;
  mimeType: string;
  storedName: string;
  stream: Readable;
};

export interface StorageStrategy {
  delete(storedName: string): Promise<void>;
  download(storedName: string): Promise<Buffer>;
  exists(storedName: string): Promise<boolean>;
  getThumbUrl(storedName: string, thumbObjectKey?: string): string;
  getUrl(storedName: string): string;
  upload(storedName: string, data: Buffer): Promise<string>;
  uploadStream(options: UploadStreamOptions): Promise<StoredFileResult>;
}

let strategyInstance: null | StorageStrategy = null;
let strategyKey = '';
let localStrategyInstance: LocalStorageStrategy | null = null;
let ossStrategyInstance: null | OssStorageStrategy = null;

export function createThumbnailStoredName(storedName: string) {
  const ext = storedName.includes('.')
    ? storedName.slice(storedName.lastIndexOf('.'))
    : '';
  if (!ext) return `${storedName}_thumb.webp`;
  return `${storedName.slice(0, -ext.length)}_thumb.webp`;
}

export function getLegacyOssProxyName(storedName: string) {
  return `oss_${storedName}`;
}

export function shouldUseOss() {
  return (
    String(process.env.OSS_PROVIDER || '').toLowerCase() === 'aliyun' &&
    Boolean(process.env.OSS_BUCKET) &&
    Boolean(process.env.OSS_ENDPOINT) &&
    Boolean(process.env.OSS_ACCESS_KEY_ID) &&
    Boolean(process.env.OSS_ACCESS_KEY_SECRET)
  );
}

export function normalizeStorageProvider(
  provider: null | string,
): StorageProvider {
  return provider === 'OSS' ? 'OSS' : 'LOCAL';
}

export function createUploadProbe(params: {
  maxThumbnailSourceBytes: number;
  maxUploadBytes: number;
}) {
  const hash = createHash('sha256');
  let size = 0;
  let thumbSize = 0;
  let thumbExceeded = false;
  const thumbChunks: Buffer[] = [];

  const stream = new Transform({
    transform(chunk, _encoding, callback) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > params.maxUploadBytes) {
        callback(
          new Error(
            `file exceeds max upload size (${params.maxUploadBytes} bytes)`,
          ),
        );
        return;
      }

      hash.update(buffer);

      if (!thumbExceeded && params.maxThumbnailSourceBytes > 0) {
        const remain = params.maxThumbnailSourceBytes - thumbSize;
        if (remain <= 0) {
          thumbExceeded = true;
        } else if (buffer.length <= remain) {
          thumbChunks.push(buffer);
          thumbSize += buffer.length;
        } else {
          thumbChunks.push(buffer.subarray(0, remain));
          thumbSize += remain;
          thumbExceeded = true;
        }
      }

      callback(null, buffer);
    },
  });

  return {
    stream,
    summary() {
      return {
        sha256: hash.digest('hex'),
        size,
        thumbSource:
          !thumbExceeded && thumbSize > 0
            ? Buffer.concat(thumbChunks, thumbSize)
            : null,
      };
    },
  };
}

export async function buildThumbnail(data: Buffer, mimeType: string) {
  if (!mimeType.startsWith('image/')) return null;
  try {
    return await sharp(data)
      .rotate()
      .resize(320, 320, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 72 })
      .toBuffer();
  } catch (error) {
    logApiError('file-thumbnail', error, { mimeType });
    return null;
  }
}

export function getStorageStrategy() {
  const nextKey = shouldUseOss() ? 'OSS' : 'LOCAL';
  if (!strategyInstance || strategyKey !== nextKey) {
    strategyInstance = getStorageStrategyForProvider(nextKey);
    strategyKey = nextKey;
  }
  return strategyInstance;
}

export function getStorageStrategyForProvider(provider: StorageProvider) {
  if (provider === 'OSS') {
    ossStrategyInstance ||= new OssStorageStrategy();
    return ossStrategyInstance;
  }
  localStrategyInstance ||= new LocalStorageStrategy();
  return localStrategyInstance;
}
