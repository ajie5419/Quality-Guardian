import { defineEventHandler, getQuery } from 'h3';
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
    const query = getQuery(event);
    const result = await FileStorageService.listOrphanFiles({
      page: Number(query.page || 1),
      pageSize: Number(query.pageSize || 20),
    });
    return useResponseSuccess(result);
  } catch (error) {
    logApiError('file-orphans', error);
    return internalServerErrorResponse(event, 'Failed to list orphan files');
  }
});
