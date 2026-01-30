import { defineEventHandler, readBody } from 'h3';
import { InspectionService } from '~/services/inspection.service';
import { useResponseError, useResponseSuccess } from '~/utils/response';

export default defineEventHandler(async (event) => {
  try {
    const { ids } = await readBody(event);
    if (!ids || !Array.isArray(ids)) return useResponseError('IDs required');

    await InspectionService.batchDelete(ids);
    return useResponseSuccess({ successCount: ids.length });
  } catch (error: any) {
    return useResponseError(error.message);
  }
});
