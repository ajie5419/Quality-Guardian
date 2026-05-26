import { defineEventHandler, getQuery } from 'h3';
import { FileStorageService } from '~/modules/file-storage/file-storage.service';
import { logApiError } from '~/utils/api-logger';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event);
    const result = await FileStorageService.listOrphanFiles({
      page: Number(query.page || 1),
      pageSize: Number(query.pageSize || 20),
    });
    return useResponseSuccess(result);
  } catch (error) {
    logApiError('file-orphans', error, undefined, event);
    return internalServerErrorResponse(event, 'Failed to list orphan files');
  }
});
