import { InspectionService } from '~/services/inspection.service';
import { logApiError } from '~/utils/api-logger';
import { useResponseError, useResponseSuccess } from '~/utils/response';

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id');
  if (!id) return useResponseError('ID required');

  try {
    const body = await readBody(event);
    const result = await InspectionService.update(id, body);
    return useResponseSuccess(result);
  } catch (error: unknown) {
    logApiError('inspection-update', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    return useResponseError(errorMessage);
  }
});
