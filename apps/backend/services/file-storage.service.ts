import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import process from 'node:process';

import OSS from 'ali-oss';
import sharp from 'sharp';
import { logApiError } from '~/utils/api-logger';
import { UPLOAD_DIR } from '~/utils/paths';
import prisma from '~/utils/prisma';

type UploadFileParams = {
  data: Buffer;
  filename?: string;
  mimeType?: null | string;
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

function toPublicFileUrl(id: string, mode: 'download' | 'preview' | 'thumb') {
  return `/api/files/${id}/${mode}`;
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

async function saveLocalFile(params: {
  data: Buffer;
  mimeType: string;
  originalName: string;
  sha256: string;
  storedName: string;
  thumbBuffer: Buffer | null;
  uploadedBy?: string;
}): Promise<FileAssetPayload> {
  if (!existsSync(UPLOAD_DIR)) {
    await mkdir(UPLOAD_DIR, { recursive: true });
  }

  await writeFile(join(UPLOAD_DIR, params.storedName), params.data);

  let thumbObjectKey: string | undefined;
  let thumbUrl: string | undefined;
  if (params.thumbBuffer) {
    thumbObjectKey = params.storedName.replace(/\.[^.]+$/, '_thumb.webp');
    await writeFile(join(UPLOAD_DIR, thumbObjectKey), params.thumbBuffer);
    thumbUrl = `/uploads/${thumbObjectKey}`;
  }

  return {
    mimeType: params.mimeType,
    objectKey: params.storedName,
    originalName: params.originalName,
    sha256: params.sha256,
    size: params.data.length,
    storageProvider: 'LOCAL',
    storedName: params.storedName,
    thumbObjectKey,
    thumbUrl,
    uploadedBy: params.uploadedBy,
    url: `/uploads/${params.storedName}`,
  };
}

async function saveOssFile(params: {
  data: Buffer;
  mimeType: string;
  originalName: string;
  sha256: string;
  storedName: string;
  thumbBuffer: Buffer | null;
  uploadedBy?: string;
}): Promise<FileAssetPayload> {
  const client = createOssClient();
  const objectKey = buildOssObjectKey(params.storedName);
  await client.put(objectKey, params.data, {
    headers: { 'Content-Type': params.mimeType },
  });

  let thumbObjectKey: string | undefined;
  if (params.thumbBuffer) {
    thumbObjectKey = objectKey.replace(/\.[^.]+$/, '_thumb.webp');
    await client.put(thumbObjectKey, params.thumbBuffer, {
      headers: { 'Content-Type': 'image/webp' },
    });
  }

  return {
    bucket: process.env.OSS_BUCKET,
    mimeType: params.mimeType,
    objectKey,
    originalName: params.originalName,
    sha256: params.sha256,
    size: params.data.length,
    storageProvider: 'OSS',
    storedName: params.storedName,
    thumbObjectKey,
    uploadedBy: params.uploadedBy,
    url: `/api/uploads/${getLegacyOssProxyName(params.storedName)}`,
  };
}

export const FileStorageService = {
  async deleteFile(id: string, userId?: number | string) {
    const file = await (prisma.file_assets as any).update({
      where: { id },
      data: {
        deletedAt: new Date(),
        status: 'DELETED',
      },
    });

    await (prisma.file_references as any).deleteMany({
      where: { fileId: id },
    });

    return {
      deletedBy: userId === undefined ? undefined : String(userId),
      file,
    };
  },

  async getFileBuffer(id: string, preferThumb = false) {
    const file = await (prisma.file_assets as any).findUnique({
      where: { id },
    });
    if (!file || file.status !== 'ACTIVE') return null;

    const objectKey =
      preferThumb && file.thumbObjectKey ? file.thumbObjectKey : file.objectKey;

    if (file.storageProvider === 'OSS') {
      const client = createOssClient();
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

  isImageFilename(filename: string) {
    return IMAGE_EXTENSIONS.has(extname(filename).toLowerCase());
  },

  async registerReference(params: {
    bizId: string;
    bizType: string;
    fieldName?: string;
    fileId: string;
    sortOrder?: number;
  }) {
    return (prisma.file_references as any).create({
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
    const attachments = Array.isArray(params.attachments)
      ? params.attachments
      : (() => {
          try {
            const parsed = JSON.parse(String(params.attachments || '[]'));
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return [];
          }
        })();
    const fileIds = attachments
      .map((item) =>
        item && typeof item === 'object'
          ? String((item as Record<string, unknown>).fileId || '').trim()
          : '',
      )
      .filter(Boolean);

    if (fileIds.length === 0) return { count: 0 };

    await prisma.file_references.deleteMany({
      where: {
        bizId: params.bizId,
        bizType: params.bizType,
        fieldName: params.fieldName || 'attachments',
      },
    });

    const result = await prisma.file_references.createMany({
      data: fileIds.map((fileId, index) => ({
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
  },

  async uploadFile(params: UploadFileParams) {
    const originalName = basename(params.filename || 'upload');
    const mimeType = getMimeType(originalName, params.mimeType);
    const storedName = createStoredName(originalName, mimeType);
    const sha256 = createHash('sha256').update(params.data).digest('hex');
    const uploadedBy =
      params.uploadedBy === undefined ? undefined : String(params.uploadedBy);
    const thumbBuffer = await buildThumbnail(params.data, mimeType);

    const saved = shouldUseOss()
      ? await saveOssFile({
          data: params.data,
          mimeType,
          originalName,
          sha256,
          storedName,
          thumbBuffer,
          uploadedBy,
        })
      : await saveLocalFile({
          data: params.data,
          mimeType,
          originalName,
          sha256,
          storedName,
          thumbBuffer,
          uploadedBy,
        });

    const asset = await (prisma.file_assets as any).create({
      data: saved,
    });

    const previewUrl =
      saved.storageProvider === 'OSS'
        ? saved.url
        : saved.url || toPublicFileUrl(asset.id, 'preview');
    const thumbUrl =
      saved.storageProvider === 'OSS' && asset.thumbObjectKey
        ? `/api/uploads/${getLegacyOssProxyName(
            asset.storedName.replace(/\.[^.]+$/, '_thumb.webp'),
          )}`
        : saved.thumbUrl ||
          (asset.thumbObjectKey ? toPublicFileUrl(asset.id, 'thumb') : '');

    await (prisma.file_assets as any).update({
      where: { id: asset.id },
      data: {
        thumbUrl: thumbUrl || null,
        url: previewUrl,
      },
    });

    return {
      ...asset,
      legacyUrl: saved.url,
      thumbFilename:
        saved.storageProvider === 'OSS' && asset.thumbObjectKey
          ? getLegacyOssProxyName(
              asset.storedName.replace(/\.[^.]+$/, '_thumb.webp'),
            )
          : asset.thumbObjectKey || null,
      thumbUrl,
      url: previewUrl,
    };
  },
};
