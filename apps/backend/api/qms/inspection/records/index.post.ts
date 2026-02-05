import { InspectionService } from '~/services/inspection.service';
import { logApiError } from '~/utils/api-logger';
import { useResponseError, useResponseSuccess } from '~/utils/response';

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event);
    const result = await InspectionService.create(body);
    return useResponseSuccess(result);
  } catch (error: unknown) {
    logApiError('inspection-create', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    return useResponseError(errorMessage);
  }
});
