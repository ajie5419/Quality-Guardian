import { defineEventHandler, getRouterParam, setResponseStatus } from 'h3';
import { InspectionService } from '~/services/inspection.service';
import { logApiError } from '~/utils/api-logger';
import { useResponseError, useResponseSuccess } from '~/utils/response';

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id');
  if (!id) {
    setResponseStatus(event, 400);
    return useResponseError('ID required');
  }

  try {
    await InspectionService.delete(id);
    return useResponseSuccess(null);
  } catch (error: unknown) {
    logApiError('inspection-delete', error);
    const errorCode = (error as { code?: string }).code;
    setResponseStatus(event, errorCode === 'P2025' ? 404 : 500);
    return useResponseError(
      errorCode === 'P2025'
        ? 'Inspection record not found'
        : 'Failed to delete inspection record',
    );
  }
});
