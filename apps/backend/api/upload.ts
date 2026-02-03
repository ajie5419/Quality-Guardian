import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { eventHandler, readMultipartFormData } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { UPLOAD_DIR } from '~/utils/paths';
import { useResponseError, useResponseSuccess } from '~/utils/response';

export default eventHandler(async (event) => {
  try {
    // Ensure upload directory exists
    if (!existsSync(UPLOAD_DIR)) {
      await mkdir(UPLOAD_DIR, { recursive: true });
    }

    // Read multipart form data
    const formData = await readMultipartFormData(event);

    if (!formData || formData.length === 0) {
      return useResponseError('No file uploaded');
    }

    const file = formData[0];
    if (!file || !file.data) {
      return useResponseError('Invalid file');
    }

    // Generate unique filename
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).slice(2, 8);
    const originalName = file.filename || 'upload';
    const ext = originalName.split('.').pop() || 'jpg';
    const filename = `${timestamp}_${randomStr}.${ext}`;

    // Save file to disk
    const filePath = join(UPLOAD_DIR, filename);
    await writeFile(filePath, file.data);

    // Return the relative URL to access the file via API
    // backend configured publicAssets to serve /uploads
    const url = `/uploads/${filename}`;

    return useResponseSuccess({
      url,
      filename,
      originalName: file.filename,
      size: file.data.length,
    });
  } catch (error) {
    logApiError('upload', error);
    return useResponseError('Upload failed');
  }
});
