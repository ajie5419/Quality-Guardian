import { defineEventHandler } from 'h3';
import { FileStorageService } from '~/services/file-storage.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  internalServerErrorResponse,
  notFoundResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) return unAuthorizedResponse(event);

  const id = getRequiredRouterParam(event, 'id', 'File ID is required');
  if (typeof id !== 'string') return id;

  try {
    const file = await FileStorageService.getFileDetail(id);
    if (!file) return notFoundResponse(event, 'File not found');
    return useResponseSuccess(file);
  } catch (error) {
    logApiError('file-detail', error, { id });
    return internalServerErrorResponse(event, 'Failed to get file detail');
  }
});
