import { defineEventHandler } from 'h3';
import { FileStorageService } from '~/modules/file-storage/file-storage.service';
import { logApiError } from '~/utils/api-logger';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  try {
    return useResponseSuccess(await FileStorageService.getStorageStats());
  } catch (error) {
    logApiError('file-storage-stats', error, undefined, event);
    return internalServerErrorResponse(
      event,
      'Failed to get file storage stats',
    );
  }
});
