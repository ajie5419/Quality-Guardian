import { defineEventHandler, readBody, setResponseStatus } from 'h3';
import { InspectionService } from '~/services/inspection.service';
import { logApiError } from '~/utils/api-logger';
import { normalizeIdList } from '~/utils/id-list';
import { useResponseError, useResponseSuccess } from '~/utils/response';

export default defineEventHandler(async (event) => {
  try {
    const body = (await readBody(event)) as { ids?: unknown };
    const ids = normalizeIdList(body.ids);
    if (ids.length === 0) {
      setResponseStatus(event, 400);
      return useResponseError('IDs required');
    }

    const result = await InspectionService.batchDelete(ids);
    return useResponseSuccess({ successCount: result.count });
  } catch (error: unknown) {
    logApiError('inspection-batch-delete', error);
    setResponseStatus(event, 500);
    return useResponseError('Failed to batch delete inspection records');
  }
});
