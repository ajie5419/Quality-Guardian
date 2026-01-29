import { defineEventHandler, getRouterParam, readBody } from 'h3';
import { InspectionService } from '~/services/inspection.service';
import { useResponseSuccess, useResponseError } from '~/utils/response';

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id');
  if (!id) return useResponseError('ID required');
  
  try {
    const body = await readBody(event);
    const result = await InspectionService.update(id, body);
    return useResponseSuccess(result);
  } catch (e: any) {
    return useResponseError(e.message);
  }
});
