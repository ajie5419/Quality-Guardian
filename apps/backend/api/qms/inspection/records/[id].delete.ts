import { InspectionService } from '~/services/inspection.service';
import { logApiError } from '~/utils/api-logger';
import { useResponseError, useResponseSuccess } from '~/utils/response';

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id');
  if (!id) return useResponseError('ID required');

  try {
    await InspectionService.delete(id);
    return useResponseSuccess(null);
  } catch (error: unknown) {
    logApiError('inspection-delete', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    return useResponseError(errorMessage);
  }
});
