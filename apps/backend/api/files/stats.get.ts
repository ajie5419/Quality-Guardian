import { defineEventHandler } from 'h3';
import { FileStorageService } from '~/services/file-storage.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) return unAuthorizedResponse(event);

  try {
    return useResponseSuccess(await FileStorageService.getStorageStats());
  } catch (error) {
    logApiError('file-storage-stats', error);
    return internalServerErrorResponse(
      event,
      'Failed to get file storage stats',
    );
  }
});
