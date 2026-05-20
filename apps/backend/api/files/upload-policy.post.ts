import { defineEventHandler, readBody } from 'h3';
import { FileStorageService } from '~/services/file-storage.service';
import { logApiError } from '~/utils/api-logger';
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
      filename?: string;
      mimeType?: string;
      size?: number;
    };

    const filename = String(body?.filename || '').trim();
    if (!filename) {
      return badRequestResponse(event, 'filename is required');
    }

    if (!FileStorageService.isDirectUploadEnabled()) {
      return badRequestResponse(event, 'direct upload is disabled');
    }

    const policy = await FileStorageService.createDirectUploadPolicy({
      filename,
      mimeType: body?.mimeType,
      size: Number(body?.size || 0),
      uploadedBy: userinfo.id,
    });

    return useResponseSuccess(policy);
  } catch (error) {
    logApiError('file-upload-policy', error, undefined, event);
    return internalServerErrorResponse(event, 'Failed to create upload policy');
  }
});
