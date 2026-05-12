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
    const result = await FileStorageService.listFiles({
      bizId: query.bizId ? String(query.bizId) : undefined,
      bizType: query.bizType ? String(query.bizType) : undefined,
      fieldName: query.fieldName ? String(query.fieldName) : undefined,
      keyword: query.keyword ? String(query.keyword) : undefined,
      mimeType: query.mimeType ? String(query.mimeType) : undefined,
      page: Number(query.page || 1),
      pageSize: Number(query.pageSize || 20),
      status: query.status ? String(query.status) : undefined,
      storageProvider: query.storageProvider
        ? String(query.storageProvider)
        : undefined,
      uploadedBy: query.uploadedBy ? String(query.uploadedBy) : undefined,
    });
    return useResponseSuccess(result);
  } catch (error) {
    logApiError('file-list', error);
    return internalServerErrorResponse(event, 'Failed to list files');
  }
});
