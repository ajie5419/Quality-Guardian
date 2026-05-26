import { defineEventHandler, setResponseStatus } from 'h3';
import { FileStorageService } from '~/modules/file-storage/file-storage.service';
import { logApiError } from '~/utils/api-logger';
import { recordBusinessAuditLog } from '~/utils/audit-log';
import { getCurrentUser } from '~/utils/current-user';
import { useResponseError } from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';

export default defineEventHandler(async (event) => {
  const userinfo = getCurrentUser(event);

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
      detailsTemplate: '查看缩略图: {{filename}}',
      detailsVariables: {
        filename: result.file.originalName,
      },
      targetId: String(id),
      targetType: 'file_asset',
      userId: userinfo.id,
    });
    return result.buffer;
  } catch (error) {
    logApiError('file-thumb', error, { id, userId: userinfo.id }, event);
    setResponseStatus(event, 500);
    return useResponseError('Failed to load thumbnail');
  }
});
