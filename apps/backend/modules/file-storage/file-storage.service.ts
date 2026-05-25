import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { createWriteStream, existsSync } from 'node:fs';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import process from 'node:process';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import OSS from 'ali-oss';
import sharp from 'sharp';
import { logApiError } from '~/utils/api-logger';
import { UPLOAD_DIR } from '~/utils/paths';
import prisma from '~/utils/prisma';
import { isPrismaSchemaMismatchError } from '~/utils/prisma-error';

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

let ossClientInstance: null | OSS = null;

function isImageMimeType(type: null | string | undefined): boolean {
  return typeof type === 'string' && type.startsWith('image/');
}

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

function shouldUseOss() {
  return (
    String(process.env.OSS_PROVIDER || '').toLowerCase() === 'aliyun' &&
    Boolean(process.env.OSS_BUCKET) &&
    Boolean(process.env.OSS_ENDPOINT) &&
    Boolean(process.env.OSS_ACCESS_KEY_ID) &&
    Boolean(process.env.OSS_ACCESS_KEY_SECRET)
  );
}

function getLegacyOssProxyName(storedName: string) {
  return `oss_${storedName}`;
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

function parseAttachmentItems(value: unknown): unknown[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'object') return [value];
  try {
    const parsed = JSON.parse(String(value));
    if (Array.isArray(parsed)) return parsed;
    return parsed ? [parsed] : [];
  } catch {
    return [value];
  }
}

function extractStoredName(value: unknown) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const withoutQuery = raw.split('?')[0] || '';
  const filename = withoutQuery.split('/').findLast(Boolean) || '';
  return filename.startsWith('oss_') ? filename.slice(4) : filename;
}

function resolveAttachmentLookup(item: unknown) {
  if (typeof item === 'string') {
    return { storedName: extractStoredName(item) };
  }
  if (!item || typeof item !== 'object') {
    return { storedName: '' };
  }
  const record = item as Record<string, unknown>;
  const fileId = String(record.fileId || '').trim();
  if (fileId) return { fileId };

  return {
    storedName: extractStoredName(
      record.url || record.path || record.filename || record.thumbUrl,
    ),
  };
}

async function buildThumbnail(data: Buffer, mimeType: string) {
  if (!isImageMimeType(mimeType)) return null;
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

function createThumbnailStoredName(storedName: string) {
  const ext = extname(storedName);
  if (!ext) return `${storedName}_thumb.webp`;
  return `${storedName.slice(0, -ext.length)}_thumb.webp`;
}

function createUploadProbe(params: {
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

async function saveLocalFileStream(params: {
  maxThumbnailSourceBytes: number;
  maxUploadBytes: number;
  mimeType: string;
  originalName: string;
  storedName: string;
  stream: Readable;
  uploadedBy?: string;
}): Promise<FileAssetPayload> {
  if (!existsSync(UPLOAD_DIR)) {
    await mkdir(UPLOAD_DIR, { recursive: true });
  }

  const filePath = join(UPLOAD_DIR, params.storedName);
  const writer = createWriteStream(filePath);
  const probe = createUploadProbe({
    maxThumbnailSourceBytes: params.maxThumbnailSourceBytes,
    maxUploadBytes: params.maxUploadBytes,
  });
  try {
    await pipeline(params.stream, probe.stream, writer);
  } catch (error) {
    await unlink(filePath).catch(() => undefined);
    throw error;
  }

  const measured = probe.summary();
  const thumbBuffer = measured.thumbSource
    ? await buildThumbnail(measured.thumbSource, params.mimeType)
    : null;

  let thumbObjectKey: string | undefined;
  let thumbUrl: string | undefined;
  if (thumbBuffer) {
    thumbObjectKey = createThumbnailStoredName(params.storedName);
    thumbUrl = `/uploads/${thumbObjectKey}`;
    await writeFile(join(UPLOAD_DIR, thumbObjectKey), thumbBuffer);
  }

  return {
    mimeType: params.mimeType,
    objectKey: params.storedName,
    originalName: params.originalName,
    sha256: measured.sha256,
    size: measured.size,
    storageProvider: 'LOCAL',
    storedName: params.storedName,
    thumbObjectKey,
    thumbUrl,
    uploadedBy: params.uploadedBy,
    url: `/uploads/${params.storedName}`,
  };
}

async function saveOssFileStream(params: {
  maxThumbnailSourceBytes: number;
  maxUploadBytes: number;
  mimeType: string;
  originalName: string;
  storedName: string;
  stream: Readable;
  uploadedBy?: string;
}): Promise<FileAssetPayload> {
  const client = getOssClient();
  const objectKey = buildOssObjectKey(params.storedName);
  const probe = createUploadProbe({
    maxThumbnailSourceBytes: params.maxThumbnailSourceBytes,
    maxUploadBytes: params.maxUploadBytes,
  });

  await (client as any).putStream(objectKey, params.stream.pipe(probe.stream), {
    headers: { 'Content-Type': params.mimeType },
  });

  const measured = probe.summary();
  const thumbBuffer = measured.thumbSource
    ? await buildThumbnail(measured.thumbSource, params.mimeType)
    : null;

  let thumbObjectKey: string | undefined;
  if (thumbBuffer) {
    thumbObjectKey = buildOssObjectKey(
      createThumbnailStoredName(params.storedName),
    );
    await client.put(thumbObjectKey, thumbBuffer, {
      headers: { 'Content-Type': 'image/webp' },
    });
  }

  return {
    bucket: process.env.OSS_BUCKET,
    mimeType: params.mimeType,
    objectKey,
    originalName: params.originalName,
    sha256: measured.sha256,
    size: measured.size,
    storageProvider: 'OSS',
    storedName: params.storedName,
    thumbObjectKey,
    uploadedBy: params.uploadedBy,
    url: `/api/uploads/${getLegacyOssProxyName(params.storedName)}`,
  };
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

    if (file.storageProvider === 'OSS') {
      const client = getOssClient();
      const result = await client.get(objectKey);
      const content = result.content;
      return {
        buffer: Buffer.isBuffer(content) ? content : Buffer.from(content),
        file,
        filename:
          preferThumb && file.thumbObjectKey
            ? `${file.id}_thumb.webp`
            : file.originalName,
        mimeType:
          preferThumb && file.thumbObjectKey ? 'image/webp' : file.mimeType,
      };
    }

    const buffer = await readFile(join(UPLOAD_DIR, objectKey));
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

  async getFileDetail(id: string) {
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

  async listFiles(params: {
    bizId?: string;
    bizType?: string;
    fieldName?: string;
    keyword?: string;
    mimeType?: string;
    page?: number;
    pageSize?: number;
    status?: string;
    storageProvider?: string;
    uploadedBy?: string;
  }) {
    const page = Math.max(1, Number(params.page || 1));
    const pageSize = Math.max(1, Math.min(200, Number(params.pageSize || 20)));
    const where: any = {};
    const keyword = String(params.keyword || '').trim();
    if (keyword) {
      where.OR = [
        { originalName: { contains: keyword } },
        { storedName: { contains: keyword } },
        { objectKey: { contains: keyword } },
        { sha256: { contains: keyword } },
      ];
    }
    if (params.status) where.status = String(params.status).toUpperCase();
    if (params.storageProvider) {
      where.storageProvider = String(params.storageProvider).toUpperCase();
    }
    if (params.uploadedBy) where.uploadedBy = String(params.uploadedBy);
    if (params.mimeType) where.mimeType = { contains: String(params.mimeType) };
    if (params.bizType || params.bizId || params.fieldName) {
      where.references = {
        some: {
          ...(params.bizType ? { bizType: params.bizType } : {}),
          ...(params.bizId ? { bizId: params.bizId } : {}),
          ...(params.fieldName ? { fieldName: params.fieldName } : {}),
        },
      };
    }

    const [items, total] = await Promise.all([
      prisma.file_assets.findMany({
        include: {
          _count: { select: { references: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        where,
      }),
      prisma.file_assets.count({ where }),
    ]);

    return { items, total };
  },

  async getStorageStats() {
    const [
      totalAgg,
      activeAgg,
      orphanCount,
      referencedCount,
      byStatus,
      byStorageProvider,
    ] = await Promise.all([
      prisma.file_assets.aggregate({
        _count: { id: true },
        _sum: { size: true },
      }),
      prisma.file_assets.aggregate({
        _count: { id: true },
        _sum: { size: true },
        where: { status: 'ACTIVE' },
      }),
      prisma.file_assets.count({
        where: { references: { none: {} }, status: 'ACTIVE' },
      }),
      prisma.file_assets.count({
        where: { references: { some: {} }, status: 'ACTIVE' },
      }),
      prisma.file_assets.groupBy({
        _count: { id: true },
        _sum: { size: true },
        by: ['status'],
      }),
      prisma.file_assets.groupBy({
        _count: { id: true },
        _sum: { size: true },
        by: ['storageProvider'],
        where: { status: 'ACTIVE' },
      }),
    ]);

    return {
      activeCount: activeAgg._count.id,
      activeSize: Number(activeAgg._sum.size || 0),
      byStatus: byStatus.map((item) => ({
        count: item._count.id,
        size: Number(item._sum.size || 0),
        status: item.status,
      })),
      byStorageProvider: byStorageProvider.map((item) => ({
        count: item._count.id,
        size: Number(item._sum.size || 0),
        storageProvider: item.storageProvider,
      })),
      orphanCount,
      referencedCount,
      totalCount: totalAgg._count.id,
      totalSize: Number(totalAgg._sum.size || 0),
    };
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
    const fileIds = [];
    for (const item of attachments) {
      const lookup = resolveAttachmentLookup(item);
      if ('fileId' in lookup && lookup.fileId) {
        const file = await prisma.file_assets.findFirst({
          select: { id: true },
          where: { id: lookup.fileId, status: 'ACTIVE' },
        });
        if (file) fileIds.push(file.id);
        continue;
      }
      if (!lookup.storedName) continue;
      const file = await prisma.file_assets.findFirst({
        select: { id: true },
        where: {
          OR: [
            { storedName: lookup.storedName },
            { objectKey: { endsWith: lookup.storedName } },
            { thumbObjectKey: { endsWith: lookup.storedName } },
          ],
          status: 'ACTIVE',
        },
      });
      if (file) fileIds.push(file.id);
    }
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

  async listOrphanFiles(params: { page?: number; pageSize?: number }) {
    const page = Math.max(1, Number(params.page || 1));
    const pageSize = Math.max(1, Math.min(200, Number(params.pageSize || 20)));
    const where = {
      references: { none: {} },
      status: 'ACTIVE' as const,
    };
    const [items, total] = await Promise.all([
      prisma.file_assets.findMany({
        include: { _count: { select: { references: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        where,
      }),
      prisma.file_assets.count({ where }),
    ]);
    return { items, total };
  },

  async scanMissingFiles(params: { limit?: number; markMissing?: boolean }) {
    const limit = Math.max(1, Math.min(500, Number(params.limit || 100)));
    const files = await prisma.file_assets.findMany({
      orderBy: { createdAt: 'asc' },
      take: limit,
      where: { status: 'ACTIVE' },
    });
    const missingIds = [];

    for (const file of files) {
      try {
        if (file.storageProvider === 'OSS') {
          const client = getOssClient();
          await client.head(file.objectKey);
        } else if (!existsSync(join(UPLOAD_DIR, file.objectKey))) {
          missingIds.push(file.id);
        }
      } catch {
        missingIds.push(file.id);
      }
    }

    if (params.markMissing && missingIds.length > 0) {
      await prisma.file_assets.updateMany({
        data: { status: 'MISSING' },
        where: { id: { in: missingIds } },
      });
    }

    return {
      checked: files.length,
      marked: params.markMissing ? missingIds.length : 0,
      missingIds,
    };
  },

  getMaxUploadBytes,

  async uploadFileStream(params: UploadFileStreamParams) {
    const originalName = basename(params.filename || 'upload');
    const mimeType = getMimeType(originalName, params.mimeType);
    const storedName = createStoredName(originalName, mimeType);
    const uploadedBy =
      params.uploadedBy === undefined ? undefined : String(params.uploadedBy);
    const maxUploadBytes = getMaxUploadBytes();
    const maxThumbnailSourceBytes = getMaxThumbnailSourceBytes();

    const saved = shouldUseOss()
      ? await saveOssFileStream({
          maxThumbnailSourceBytes,
          maxUploadBytes,
          mimeType,
          originalName,
          storedName,
          stream: params.stream,
          uploadedBy,
        })
      : await saveLocalFileStream({
          maxThumbnailSourceBytes,
          maxUploadBytes,
          mimeType,
          originalName,
          storedName,
          stream: params.stream,
          uploadedBy,
        });

    const previewUrl = saved.storageProvider === 'OSS' ? saved.url : saved.url;
    const thumbUrl =
      saved.storageProvider === 'OSS' && saved.thumbObjectKey
        ? `/api/uploads/${getLegacyOssProxyName(
            createThumbnailStoredName(saved.storedName),
          )}`
        : saved.thumbUrl || '';

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
          ? getLegacyOssProxyName(createThumbnailStoredName(saved.storedName))
          : saved.thumbObjectKey || null,
      thumbUrl,
      url: previewUrl,
    };
  },

  async uploadFile(params: UploadFileParams) {
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
