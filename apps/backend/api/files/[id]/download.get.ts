import { defineEventHandler, setResponseStatus } from 'h3';
import { FileStorageService } from '~/modules/file-storage/file-storage.service';
import { recordBusinessAuditLog } from '~/modules/system-log/audit-log';
import { logApiError } from '~/utils/api-logger';
import { getCurrentUser } from '~/utils/current-user';
import { useResponseError } from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';

function encodeDownloadName(name: string) {
  return encodeURIComponent(name).replaceAll('%20', '+');
}

export default defineEventHandler(async (event) => {
  const userinfo = getCurrentUser(event);

  const id = getRequiredRouterParam(event, 'id', 'File ID is required');
  if (typeof id !== 'string') return id;

  try {
    const result = await FileStorageService.getFileBuffer(id);
    if (!result) {
      setResponseStatus(event, 404);
      return useResponseError('File not found');
    }

    event.node.res.setHeader('Content-Type', result.mimeType);
    event.node.res.setHeader('Content-Length', result.buffer.length);
    event.node.res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeDownloadName(result.filename)}`,
    );
    await recordBusinessAuditLog(event, {
      action: 'READ',
      detailsTemplate: '下载文件: {{filename}}',
      detailsVariables: {
        filename: result.file.originalName,
      },
      targetId: String(id),
      targetType: 'file_asset',
      userId: userinfo.id,
    });
    return result.buffer;
  } catch (error) {
    logApiError('file-download', error, { id, userId: userinfo.id }, event);
    setResponseStatus(event, 500);
    return useResponseError('Failed to download file');
  }
});
