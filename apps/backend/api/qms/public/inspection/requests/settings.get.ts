import { defineEventHandler } from 'h3';
import { SystemService } from '~/modules/system';
import { logApiError } from '~/utils/api-logger';
import { internalServerErrorResponse, useResponseSuccess } from '~/utils/response';

export default defineEventHandler(async (event) => {
  try {
    const incomingMaterialFreeInputEnabled =
      await SystemService.isIncomingMaterialFreeInputEnabled();
    return useResponseSuccess({ incomingMaterialFreeInputEnabled });
  } catch (error) {
    logApiError('get-public-inspection-request-settings', error, undefined, event);
    return internalServerErrorResponse(event, 'Failed to fetch inspection request settings');
  }
});
