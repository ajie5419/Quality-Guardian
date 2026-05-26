import type {
  FileAssetItem,
  FileListParams,
  FilePageResult,
  FileStorageStats,
  ScanMissingResult,
  UploadFileResult,
} from '@qgs/shared';

import { Buffer } from 'node:buffer';
import { basename, extname } from 'node:path';
import process from 'node:process';
import { Readable } from 'node:stream';

import { logApiError } from '~/utils/api-logger';
import prisma from '~/utils/prisma';
import { isPrismaSchemaMismatchError } from '~/utils/prisma-error';

import {
  getFileStorageStats,
  listFileAssets,
  listOrphanFileAssets,
  scanMissingFileAssets,
} from './file-asset-query';
import {
  extractStoredName,
  parseAttachmentItems,
  resolveAttachmentLookup,
} from './file-attachment';
import {
  createThumbnailStoredName,
  getStorageStrategy,
  getStorageStrategyForProvider,
  normalizeStorageProvider,
} from './storage-strategy';

type UploadFileParams = {
  data: Buffer;
  filename?: string;
  mimeType?: null | string;
  uploadedBy?: number | string;
};

type UploadFileStreamParams = {
  filename?: string;
  mimeType?: null | string;
  stream: Readable;
  uploadedBy?: number | string;
};

type FileAssetPayload = {
  bucket?: string;
  mimeType: string;
  objectKey: string;
  originalName: string;
  sha256: string;
  size: number;
  storageProvider: 'LOCAL' | 'OSS';
  storedName: string;
  thumbObjectKey?: string;
  thumbUrl?: string;
  uploadedBy?: string;
  url: string;
};

const IMAGE_EXTENSIONS = new Set([
  '.bmp',
  '.gif',
  '.jpeg',
  '.jpg',
  '.png',
  '.svg',
  '.webp',
]);

const MIME_TYPES: Record<string, string> = {
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

const DEFAULT_MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const DEFAULT_MAX_THUMB_SOURCE_BYTES = 10 * 1024 * 1024;

function sanitizeExtension(filename: string, mimeType?: null | string) {
  const ext = extname(filename).toLowerCase();
  if (ext) return ext;
  if (mimeType === 'image/png') return '.png';
  if (mimeType === 'image/jpeg') return '.jpg';
  if (mimeType === 'image/webp') return '.webp';
  if (mimeType === 'application/pdf') return '.pdf';
  return '.bin';
}

function createStoredName(originalName: string, mimeType?: null | string) {
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  const ext = sanitizeExtension(originalName, mimeType);
  return `${timestamp}_${random}${ext}`;
}

function getMimeType(filename: string, fallback?: null | string) {
  return (
    fallback ||
    MIME_TYPES[extname(filename).toLowerCase()] ||
    'application/octet-stream'
  );
}

function parsePositiveInteger(value: unknown, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.trunc(parsed);
}

function getMaxUploadBytes() {
  return Math.max(
    1,
    parsePositiveInteger(
      process.env.MAX_UPLOAD_BYTES,
      DEFAULT_MAX_UPLOAD_BYTES,
    ),
  );
}

function getMaxThumbnailSourceBytes() {
  return Math.max(
    0,
    parsePositiveInteger(
      process.env.THUMBNAIL_SOURCE_MAX_BYTES,
      DEFAULT_MAX_THUMB_SOURCE_BYTES,
    ),
  );
}

export const FileStorageService = {
  isImageFilename(filename: string) {
    return IMAGE_EXTENSIONS.has(extname(filename).toLowerCase());
  },

  async deleteFile(id: string, userId?: number | string) {
    const file = await prisma.file_assets.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        status: 'DELETED',
      },
    });

    await prisma.file_references.deleteMany({
      where: { fileId: id },
    });

    return {
      deletedBy: userId === undefined ? undefined : String(userId),
      file,
    };
  },

  async getFileBuffer(id: string, preferThumb = false) {
    const file = await prisma.file_assets.findUnique({
      where: { id },
    });
    if (!file || file.status !== 'ACTIVE') return null;

    const objectKey =
      preferThumb && file.thumbObjectKey ? file.thumbObjectKey : file.objectKey;

    const buffer = await getStorageStrategyForProvider(
      normalizeStorageProvider(file.storageProvider),
    ).download(objectKey);
    return {
      buffer,
      file,
      filename:
        preferThumb && file.thumbObjectKey
          ? `${file.id}_thumb.webp`
          : file.originalName,
      mimeType:
        preferThumb && file.thumbObjectKey ? 'image/webp' : file.mimeType,
    };
  },

  async getFileBufferByStoredName(storedName: string) {
    const normalizedName = storedName.startsWith('oss_')
      ? storedName.slice(4)
      : storedName;
    const preferThumb = normalizedName.endsWith('_thumb.webp');
    const file = await prisma.file_assets.findFirst({
      where: {
        OR: [
          { storedName: normalizedName },
          { objectKey: { endsWith: normalizedName } },
          { thumbObjectKey: { endsWith: normalizedName } },
        ],
        status: 'ACTIVE',
      },
    });
    if (!file) return null;
    return this.getFileBuffer(file.id, preferThumb);
  },

  async getFileDetail(id: string): Promise<FileAssetItem | null> {
    return prisma.file_assets.findUnique({
      include: {
        references: {
          orderBy: [
            { bizType: 'asc' },
            { fieldName: 'asc' },
            { sortOrder: 'asc' },
          ],
        },
      },
      where: { id },
    });
  },

  async listFiles(params: FileListParams): Promise<FilePageResult> {
    return listFileAssets(params);
  },

  async getStorageStats(): Promise<FileStorageStats> {
    return getFileStorageStats();
  },

  async registerReference(params: {
    bizId: string;
    bizType: string;
    fieldName?: string;
    fileId: string;
    sortOrder?: number;
  }) {
    return prisma.file_references.create({
      data: {
        bizId: params.bizId,
        bizType: params.bizType,
        fieldName: params.fieldName || 'attachments',
        fileId: params.fileId,
        sortOrder: params.sortOrder || 0,
      },
    });
  },

  async registerReferencesFromAttachments(params: {
    attachments: unknown;
    bizId: string;
    bizType: string;
    fieldName?: string;
  }) {
    const attachments = parseAttachmentItems(params.attachments);
    const requestedFileIds: string[] = [];
    const requestedStoredNames: string[] = [];
    for (const item of attachments) {
      const lookup = resolveAttachmentLookup(item);
      if ('fileId' in lookup && lookup.fileId) {
        requestedFileIds.push(lookup.fileId);
        continue;
      }
      if (lookup.storedName) requestedStoredNames.push(lookup.storedName);
    }

    const [filesById, filesByStoredName] = await Promise.all([
      requestedFileIds.length > 0
        ? prisma.file_assets.findMany({
            select: { id: true },
            where: {
              id: { in: [...new Set(requestedFileIds)] },
              status: 'ACTIVE',
            },
          })
        : Promise.resolve([]),
      requestedStoredNames.length > 0
        ? prisma.file_assets.findMany({
            select: {
              id: true,
              objectKey: true,
              storedName: true,
              thumbObjectKey: true,
            },
            where: {
              OR: [
                { storedName: { in: [...new Set(requestedStoredNames)] } },
                ...requestedStoredNames.map((storedName) => ({
                  objectKey: { endsWith: storedName },
                })),
                ...requestedStoredNames.map((storedName) => ({
                  thumbObjectKey: { endsWith: storedName },
                })),
              ],
              status: 'ACTIVE',
            },
          })
        : Promise.resolve([]),
    ]);

    const activeIds = new Set(filesById.map((file) => file.id));
    const storedNameToFileId = new Map<string, string>();
    for (const file of filesByStoredName) {
      storedNameToFileId.set(file.storedName, file.id);
      storedNameToFileId.set(extractStoredName(file.objectKey), file.id);
      storedNameToFileId.set(extractStoredName(file.thumbObjectKey), file.id);
    }
    const fileIds = attachments
      .map((item) => {
        const lookup = resolveAttachmentLookup(item);
        if ('fileId' in lookup && lookup.fileId) {
          return activeIds.has(lookup.fileId) ? lookup.fileId : null;
        }
        return lookup.storedName
          ? storedNameToFileId.get(lookup.storedName) || null
          : null;
      })
      .filter(Boolean);
    const uniqueFileIds = [...new Set(fileIds)];

    await prisma.file_references.deleteMany({
      where: {
        bizId: params.bizId,
        bizType: params.bizType,
        fieldName: params.fieldName || 'attachments',
      },
    });

    if (uniqueFileIds.length === 0) return { count: 0 };

    const result = await prisma.file_references.createMany({
      data: uniqueFileIds.map((fileId, index) => ({
        bizId: params.bizId,
        bizType: params.bizType,
        fieldName: params.fieldName || 'attachments',
        fileId,
        sortOrder: index,
      })),
      skipDuplicates: true,
    });
    return result;
  },

  async softDeleteReferences(params: { bizId: string; bizType: string }) {
    try {
      const references = await prisma.file_references.findMany({
        select: { fileId: true },
        where: {
          bizId: params.bizId,
          bizType: params.bizType,
        },
      });
      const fileIds = [...new Set(references.map((item) => item.fileId))];

      await prisma.file_references.deleteMany({
        where: {
          bizId: params.bizId,
          bizType: params.bizType,
        },
      });

      if (fileIds.length > 0) {
        await prisma.file_assets.updateMany({
          data: {
            deletedAt: new Date(),
            status: 'DELETED',
          },
          where: {
            id: { in: fileIds },
            references: { none: {} },
          },
        });
      }
    } catch (error) {
      if (isPrismaSchemaMismatchError(error)) {
        logApiError('file-reference-soft-delete-schema-missing', error, params);
        return;
      }
      throw error;
    }
  },

  async listOrphanFiles(params: {
    page?: number;
    pageSize?: number;
  }): Promise<FilePageResult> {
    return listOrphanFileAssets(params);
  },

  async scanMissingFiles(params: {
    limit?: number;
    markMissing?: boolean;
  }): Promise<ScanMissingResult> {
    return scanMissingFileAssets(params);
  },

  getMaxUploadBytes,

  async uploadFileStream(
    params: UploadFileStreamParams,
  ): Promise<UploadFileResult> {
    const originalName = basename(params.filename || 'upload');
    const mimeType = getMimeType(originalName, params.mimeType);
    const storedName = createStoredName(originalName, mimeType);
    const uploadedBy =
      params.uploadedBy === undefined ? undefined : String(params.uploadedBy);
    const maxUploadBytes = getMaxUploadBytes();
    const maxThumbnailSourceBytes = getMaxThumbnailSourceBytes();

    const strategy = getStorageStrategy();
    const saved = {
      ...(await strategy.uploadStream({
        maxThumbnailSourceBytes,
        maxUploadBytes,
        mimeType,
        storedName,
        stream: params.stream,
      })),
      mimeType,
      originalName,
      uploadedBy,
    } satisfies FileAssetPayload;

    const previewUrl = saved.url;
    const thumbUrl =
      strategy.getThumbUrl(saved.storedName, saved.thumbObjectKey) ||
      saved.thumbUrl ||
      '';

    const asset = await prisma.file_assets.create({
      data: {
        ...saved,
        thumbUrl: thumbUrl || null,
        url: previewUrl,
      },
    });

    return {
      ...asset,
      legacyUrl: saved.url,
      thumbFilename:
        saved.storageProvider === 'OSS' && saved.thumbObjectKey
          ? `oss_${createThumbnailStoredName(saved.storedName)}`
          : saved.thumbObjectKey || null,
      thumbUrl,
      url: previewUrl,
    };
  },

  async uploadFile(params: UploadFileParams): Promise<UploadFileResult> {
    if (!params.data || params.data.length === 0) {
      throw new Error('upload file payload is empty');
    }

    return this.uploadFileStream({
      filename: params.filename,
      mimeType: params.mimeType,
      stream: Readable.from(params.data),
      uploadedBy: params.uploadedBy,
    });
  },
};
