import { existsSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';

import { createError, defineEventHandler } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { UPLOAD_DIR } from '~/utils/paths';

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

export default defineEventHandler((event) => {
  const filename = event.context.params?.filename;

  if (!filename) {
    throw createError({
      statusCode: 400,
      message: 'Filename is required',
    });
  }

  const filePath = join(UPLOAD_DIR, filename);

  // Security check
  if (!filePath.startsWith(UPLOAD_DIR)) {
    throw createError({
      statusCode: 403,
      message: 'Access denied',
    });
  }

  if (!existsSync(filePath)) {
    // Log absolute path to help identify shared DB vs local storage discrepancies
    console.error(`[Serving] File not found at absolute path: ${filePath}`);
    throw createError({
      statusCode: 404,
      message: 'File not found',
    });
  }

  try {
    const fileBuffer = readFileSync(filePath);
    const ext = extname(filename).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    event.node.res.setHeader('Content-Type', contentType);
    event.node.res.setHeader('Content-Length', fileBuffer.length);
    event.node.res.setHeader('Cache-Control', 'public, max-age=31536000');
    event.node.res.setHeader('Access-Control-Allow-Origin', '*');

    return fileBuffer;
  } catch (error) {
    logApiError('uploads', error);
    throw createError({
      statusCode: 500,
      message: 'Internal Server Error',
    });
  }
});
