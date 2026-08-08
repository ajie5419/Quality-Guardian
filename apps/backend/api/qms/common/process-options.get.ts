import { defineEventHandler } from 'h3';
import { ProcessMasterService } from '~/modules/process-master';
import { logApiError } from '~/utils/api-logger';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  try {
    const items = await ProcessMasterService.listActiveOptions();
    return useResponseSuccess(
      items.map((item) => ({
        dictKey: item.name,
        dictValue: item.name,
        id: item.id,
        sort: item.sort,
        supplierSource: item.supplierSource,
        inspectionRequestCategory: item.inspectionRequestCategory,
      })),
    );
  } catch (error: unknown) {
    logApiError('process-master-options', error, undefined, event);
    return internalServerErrorResponse(event, 'Failed to load processes');
  }
});
