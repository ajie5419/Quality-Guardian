import { defineEventHandler, readBody } from 'h3';
import { InspectionService } from '~/services/inspection.service';
import { logApiError } from '~/utils/api-logger';
import { normalizeIdList } from '~/utils/id-list';
import {
  badRequestResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  try {
    const body = (await readBody(event)) as { ids?: unknown };
    const ids = normalizeIdList(body.ids);
    if (ids.length === 0) {
      return badRequestResponse(event, 'IDs required');
    }

    const result = await InspectionService.batchDelete(ids);
    return useResponseSuccess({ successCount: result.count });
  } catch (error: unknown) {
    logApiError('inspection-batch-delete', error);
    return internalServerErrorResponse(
      event,
      'Failed to batch delete inspection records',
    );
  }
});
