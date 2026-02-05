import { InspectionService } from '~/services/inspection.service';
import { logApiError } from '~/utils/api-logger';
import { useResponseError, useResponseSuccess } from '~/utils/response';

export default defineEventHandler(async (event) => {
  try {
    const { ids } = await readBody(event);
    if (!ids || !Array.isArray(ids)) return useResponseError('IDs required');

    await InspectionService.batchDelete(ids);
    return useResponseSuccess({ successCount: ids.length });
  } catch (error: unknown) {
    logApiError('inspection-batch-delete', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    return useResponseError(errorMessage);
  }
});
