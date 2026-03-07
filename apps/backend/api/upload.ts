import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { eventHandler, readMultipartFormData, setResponseStatus } from 'h3';
import sharp from 'sharp';
import { logApiError } from '~/utils/api-logger';
import { UPLOAD_DIR } from '~/utils/paths';
import { useResponseError, useResponseSuccess } from '~/utils/response';

function isImageMimeType(type: null | string | undefined): boolean {
  return typeof type === 'string' && type.startsWith('image/');
}

export default eventHandler(async (event) => {
  try {
    // Ensure upload directory exists
    if (!existsSync(UPLOAD_DIR)) {
      await mkdir(UPLOAD_DIR, { recursive: true });
    }

    // Read multipart form data
    const formData = await readMultipartFormData(event);

    if (!formData || formData.length === 0) {
      setResponseStatus(event, 400);
      return useResponseError('No file uploaded');
    }

    const file = formData[0];
    if (!file || !file.data) {
      setResponseStatus(event, 400);
      return useResponseError('Invalid file');
    }

    // Generate unique filename
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).slice(2, 8);
    const originalName = file.filename || 'upload';
    const ext = originalName.split('.').pop() || 'jpg';
    const filename = `${timestamp}_${randomStr}.${ext}`;
    const thumbFilename = `${timestamp}_${randomStr}_thumb.webp`;

    // Save file to disk
    const filePath = join(UPLOAD_DIR, filename);
    await writeFile(filePath, file.data);

    let thumbUrl = '';
    if (isImageMimeType(file.type)) {
      try {
        const thumbPath = join(UPLOAD_DIR, thumbFilename);
        const thumbBuffer = await sharp(file.data)
          .rotate()
          .resize(320, 320, {
            fit: 'inside',
            withoutEnlargement: true,
          })
          .webp({ quality: 72 })
          .toBuffer();
        await writeFile(thumbPath, thumbBuffer);
        thumbUrl = `/uploads/${thumbFilename}`;
      } catch (thumbError) {
        // Thumbnail generation failure should not break upload flow.
        logApiError('upload-thumbnail', thumbError, {
          file: originalName,
          type: file.type,
        });
      }
    }

    // Return the relative URL to access the file via API
    // backend configured publicAssets to serve /uploads
    const url = `/uploads/${filename}`;

    return useResponseSuccess({
      url,
      thumbUrl,
      filename,
      thumbFilename: thumbUrl ? thumbFilename : null,
      originalName: file.filename,
      size: file.data.length,
    });
  } catch (error) {
    logApiError('upload', error);
    setResponseStatus(event, 500);
    return useResponseError('Upload failed');
  }
});
