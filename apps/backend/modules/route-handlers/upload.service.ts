import { once } from 'node:events';

import Busboy from '@fastify/busboy';
import { eventHandler, setResponseStatus } from 'h3';
import { FileStorageService } from '~/modules/file-storage/file-storage.service';
import { recordBusinessAuditLog } from '~/modules/system-log/audit-log';
import { logApiError } from '~/utils/api-logger';
import { getCurrentUser } from '~/utils/current-user';
import { useResponseError, useResponseSuccess } from '~/utils/response';

export default eventHandler(async (event) => {
  try {
    const userinfo = getCurrentUser(event);
    const rawContentType = event.node.req.headers['content-type'];
    const contentType = Array.isArray(rawContentType)
      ? rawContentType[0]
      : rawContentType;
    if (!contentType || !contentType.includes('multipart/form-data')) {
      setResponseStatus(event, 400);
      return useResponseError('Invalid content type');
    }

    const maxUploadBytes = FileStorageService.getMaxUploadBytes();
    const busboy = new Busboy({
      headers: {
        ...event.node.req.headers,
        'content-type': contentType,
      },
      limits: {
        fileSize: maxUploadBytes,
        files: 1,
      },
    });

    let hasFile = false;
    let uploaded: Awaited<
      ReturnType<typeof FileStorageService.uploadFile>
    > | null = null;
    let uploadError: Error | null = null;
    let uploadTask: null | Promise<void> = null;

    busboy.on('file', (fieldName, file, filename, _encoding, mimeType) => {
      if (fieldName !== 'file') {
        file.resume();
        return;
      }
      if (uploadTask) {
        file.resume();
        return;
      }
      hasFile = true;

      file.on('limit', () => {
        file.destroy(
          new Error(`file exceeds max upload size (${maxUploadBytes} bytes)`),
        );
      });

      uploadTask = FileStorageService.uploadFileStream({
        filename,
        mimeType,
        stream: file,
        uploadedBy: userinfo?.id,
      })
        .then((result) => {
          uploaded = result;
        })
        .catch((error) => {
          uploadError =
            error instanceof Error ? error : new Error(String(error));
        });
    });
    busboy.on('error', (error) => {
      uploadError = error instanceof Error ? error : new Error(String(error));
    });

    event.node.req.pipe(busboy);
    await once(busboy, 'finish');
    await uploadTask;

    if (uploadError) {
      throw uploadError;
    }
    if (!hasFile || !uploaded) {
      setResponseStatus(event, 400);
      return useResponseError('No file uploaded');
    }
    await recordBusinessAuditLog(event, {
      action: 'CREATE',
      detailsTemplate: '上传文件: {{filename}}',
      detailsVariables: {
        filename: uploaded.originalName,
      },
      targetId: String(uploaded.id),
      targetType: 'file_asset',
      userId: userinfo?.id,
    });

    return useResponseSuccess({
      fileId: uploaded.id,
      filename: uploaded.storedName,
      originalName: uploaded.originalName,
      size: uploaded.size,
      thumbFilename: uploaded.thumbFilename,
      thumbUrl: uploaded.thumbUrl,
      type: uploaded.mimeType,
      url: uploaded.url,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('max upload size')) {
      setResponseStatus(event, 413);
      return useResponseError(
        `File too large (max ${FileStorageService.getMaxUploadBytes()} bytes)`,
      );
    }
    logApiError('upload', error, undefined, event);
    setResponseStatus(event, 500);
    return useResponseError('Upload failed');
  }
});
