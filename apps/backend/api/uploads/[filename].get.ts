import { existsSync, readFileSync } from 'node:fs';
import { extname, relative, resolve } from 'node:path';

import { defineEventHandler, getRouterParam, setResponseStatus } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { UPLOAD_DIR } from '~/utils/paths';
import { useResponseError } from '~/utils/response';

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
  const filename = getRouterParam(event, 'filename');

  if (!filename) {
    setResponseStatus(event, 400);
    return useResponseError('Filename is required');
  }

  const filePath = resolve(UPLOAD_DIR, filename);
  const relativePath = relative(UPLOAD_DIR, filePath);

  // Security check
  if (relativePath.startsWith('..') || relativePath.includes('\0')) {
    setResponseStatus(event, 403);
    return useResponseError('Access denied');
  }

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
    event.node.res.setHeader('Cache-Control', 'public, max-age=31536000');
    event.node.res.setHeader('Access-Control-Allow-Origin', '*');

    return fileBuffer;
  } catch (error) {
    logApiError('uploads', error);
    setResponseStatus(event, 500);
    return useResponseError('Internal Server Error');
  }
});
