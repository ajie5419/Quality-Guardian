import { existsSync, readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { extname, relative, resolve } from 'node:path';

import { defineEventHandler, setResponseStatus } from 'h3';
import sharp from 'sharp';
import { logApiError } from '~/utils/api-logger';
import { UPLOAD_DIR } from '~/utils/paths';
import { useResponseError } from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';

// MIME types mapping
const MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
};

const THUMB_SUFFIX = '_thumb.webp';
const THUMB_SOURCE_EXTENSIONS = [
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.bmp',
  '.svg',
];

async function ensureThumbnailIfNeeded(filename: string, filePath: string) {
  if (existsSync(filePath) || !filename.endsWith(THUMB_SUFFIX)) {
    return;
  }

  const baseName = filename.slice(0, -THUMB_SUFFIX.length);
  let sourcePath: string | undefined;
  for (const ext of THUMB_SOURCE_EXTENSIONS) {
    const candidate = resolve(UPLOAD_DIR, `${baseName}${ext}`);
    if (existsSync(candidate)) {
      sourcePath = candidate;
      break;
    }
  }

  if (!sourcePath) {
    return;
  }

  try {
    const thumbBuffer = await sharp(sourcePath)
      .rotate()
      .resize(320, 320, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 72 })
      .toBuffer();
    await writeFile(filePath, thumbBuffer);
  } catch (error) {
    logApiError('uploads-thumbnail-lazy-generate', error, {
      filename,
      sourcePath,
    });
  }
}

export default defineEventHandler(async (event) => {
  const filename = getRequiredRouterParam(
    event,
    'filename',
    'Filename is required',
  );
  if (typeof filename !== 'string') {
    return filename;
  }

  const filePath = resolve(UPLOAD_DIR, filename);
  const relativePath = relative(UPLOAD_DIR, filePath);

  // Security check
  if (relativePath.startsWith('..') || relativePath.includes('\0')) {
    setResponseStatus(event, 403);
    return useResponseError('Access denied');
  }

  await ensureThumbnailIfNeeded(filename, filePath);

  if (!existsSync(filePath)) {
    // Log absolute path to help identify shared DB vs local storage discrepancies
    console.error(`[Serving] File not found at absolute path: ${filePath}`);
    setResponseStatus(event, 404);
    return useResponseError('File not found');
  }

  try {
    const fileBuffer = readFileSync(filePath);
    const ext = extname(filename).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    event.node.res.setHeader('Content-Type', contentType);
    event.node.res.setHeader('Content-Length', fileBuffer.length);
    // Filenames are unique (timestamp + random), safe for long immutable cache.
    event.node.res.setHeader(
      'Cache-Control',
      'public, max-age=31536000, immutable',
    );
    event.node.res.setHeader('Access-Control-Allow-Origin', '*');

    return fileBuffer;
  } catch (error) {
    logApiError('uploads', error);
    setResponseStatus(event, 500);
    return useResponseError('读取文件失败');
  }
});
