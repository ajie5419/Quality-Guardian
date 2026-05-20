import { defineEventHandler, readBody } from 'h3';
import { FileStorageService } from '~/services/file-storage.service';
import { logApiError } from '~/utils/api-logger';
import { recordBusinessAuditLog } from '~/utils/audit-log';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  badRequestResponse,
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) return unAuthorizedResponse(event);

  try {
    const body = (await readBody(event)) as {
      ticket?: string;
    };
    const ticket = String(body?.ticket || '').trim();
    if (!ticket) {
      return badRequestResponse(event, 'ticket is required');
    }

    const file = await FileStorageService.completeDirectUpload({
      ticket,
      uploadedBy: userinfo.id,
    });

    await recordBusinessAuditLog(event, {
      action: 'CREATE',
      detailsTemplate: '直传文件: {{filename}}',
      detailsVariables: {
        filename: file.originalName,
      },
      targetId: String(file.id),
      targetType: 'file_asset',
      userId: userinfo.id,
    });

    return useResponseSuccess({
      fileId: file.id,
      filename: file.storedName,
      originalName: file.originalName,
      size: file.size,
      thumbFilename: file.thumbFilename,
      thumbUrl: file.thumbUrl,
      type: file.mimeType,
      url: file.url,
    });
  } catch (error) {
    logApiError('file-upload-complete', error, undefined, event);
    return internalServerErrorResponse(event, 'Failed to complete upload');
  }
});
