import { defineEventHandler, setResponseStatus } from 'h3';
import { FileStorageService } from '~/services/file-storage.service';
import { logApiError } from '~/utils/api-logger';
import { recordBusinessAuditLog } from '~/utils/audit-log';
import { verifyAccessToken } from '~/utils/jwt-utils';
import { unAuthorizedResponse, useResponseError } from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) return unAuthorizedResponse(event);

  const id = getRequiredRouterParam(event, 'id', 'File ID is required');
  if (typeof id !== 'string') return id;

  try {
    const result = await FileStorageService.getFileBuffer(id, true);
    if (!result) {
      setResponseStatus(event, 404);
      return useResponseError('File not found');
    }

    event.node.res.setHeader('Content-Type', result.mimeType);
    event.node.res.setHeader('Content-Length', result.buffer.length);
    event.node.res.setHeader('Cache-Control', 'private, max-age=300');
    await recordBusinessAuditLog(event, {
      action: 'READ',
      details: `查看缩略图: ${result.file.originalName}`,
      targetId: String(id),
      targetType: 'file_asset',
      userId: userinfo.id,
    });
    return result.buffer;
  } catch (error) {
    logApiError('file-thumb', error, { id, userId: userinfo.id });
    setResponseStatus(event, 500);
    return useResponseError('Failed to load thumbnail');
  }
});
