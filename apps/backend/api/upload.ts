import { eventHandler, readMultipartFormData, setResponseStatus } from 'h3';
import { FileStorageService } from '~/services/file-storage.service';
import { logApiError } from '~/utils/api-logger';
import { recordBusinessAuditLog } from '~/utils/audit-log';
import { verifyAccessToken } from '~/utils/jwt-utils';
import { useResponseError, useResponseSuccess } from '~/utils/response';

export default eventHandler(async (event) => {
  try {
    const userinfo = verifyAccessToken(event);
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

    const uploaded = await FileStorageService.uploadFile({
      data: file.data,
      filename: file.filename,
      mimeType: file.type,
      uploadedBy: userinfo?.id,
    });

    await recordBusinessAuditLog(event, {
      action: 'CREATE',
      details: `上传文件: ${uploaded.originalName}`,
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
    logApiError('upload', error);
    setResponseStatus(event, 500);
    return useResponseError('Upload failed');
  }
});
