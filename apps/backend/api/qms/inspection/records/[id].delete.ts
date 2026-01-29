import { defineEventHandler, getRouterParam } from 'h3';
import { InspectionService } from '~/services/inspection.service';
import { useResponseSuccess, useResponseError } from '~/utils/response';

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id');
  if (!id) return useResponseError('ID required');

  try {
    await InspectionService.delete(id);
    return useResponseSuccess(null);
  } catch (e: any) {
    return useResponseError(e.message);
  }
});
