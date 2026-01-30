import { defineEventHandler, getRouterParam } from 'h3';
import { InspectionService } from '~/services/inspection.service';
import { useResponseError, useResponseSuccess } from '~/utils/response';

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id');
  if (!id) return useResponseError('ID required');

  try {
    await InspectionService.delete(id);
    return useResponseSuccess(null);
  } catch (error: any) {
    return useResponseError(error.message);
  }
});
