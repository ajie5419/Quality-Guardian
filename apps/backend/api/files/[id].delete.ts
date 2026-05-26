import { defineEventHandler, setResponseStatus } from 'h3';
import { FileStorageService } from '~/modules/file-storage/file-storage.service';
import { recordBusinessAuditLog } from '~/modules/system-log/audit-log';
import { logApiError } from '~/utils/api-logger';
import { getCurrentUser } from '~/utils/current-user';
import { useResponseError, useResponseSuccess } from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';

export default defineEventHandler(async (event) => {
  const userinfo = getCurrentUser(event);

  const id = getRequiredRouterParam(event, 'id', 'File ID is required');
  if (typeof id !== 'string') return id;

  try {
    const result = await FileStorageService.deleteFile(id, userinfo.id);
    await recordBusinessAuditLog(event, {
      action: 'DELETE',
      detailsTemplate: '删除文件: {{filename}}',
      detailsVariables: {
        filename: result.file.originalName,
      },
      targetId: String(id),
      targetType: 'file_asset',
      userId: userinfo.id,
    });
    return useResponseSuccess(null);
  } catch (error) {
    logApiError('file-delete', error, { id, userId: userinfo.id }, event);
    setResponseStatus(event, 500);
    return useResponseError('Failed to delete file');
  }
});
