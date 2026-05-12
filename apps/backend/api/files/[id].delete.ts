import { defineEventHandler, setResponseStatus } from 'h3';
import { FileStorageService } from '~/services/file-storage.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  unAuthorizedResponse,
  useResponseError,
  useResponseSuccess,
} from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) return unAuthorizedResponse(event);

  const id = getRequiredRouterParam(event, 'id', 'File ID is required');
  if (typeof id !== 'string') return id;

  try {
    await FileStorageService.deleteFile(id, userinfo.id);
    return useResponseSuccess(null);
  } catch (error) {
    logApiError('file-delete', error, { id, userId: userinfo.id });
    setResponseStatus(event, 500);
    return useResponseError('Failed to delete file');
  }
});
