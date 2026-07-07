import { defineEventHandler } from 'h3';
import { SystemService } from '~/modules/system/system.service';
import { logApiError } from '~/utils/api-logger';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  try {
    const enabled = await SystemService.isInspectionManualCreateEnabled();
    return useResponseSuccess({ enabled });
  } catch (error) {
    logApiError(
      'get-inspection-manual-create-setting',
      error,
      undefined,
      event,
    );
    return internalServerErrorResponse(
      event,
      'Failed to fetch inspection manual create setting',
    );
  }
});
