import {
  assertInspectionProcessPermission,
  PROCESS_SETTING_LIST_PERMISSION,
  ProcessMasterService,
} from '~/modules/process-master';
import { logApiError } from '~/utils/api-logger';
import { businessErrorResponse, isBusinessError } from '~/utils/business-error';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  try {
    await assertInspectionProcessPermission(
      event,
      PROCESS_SETTING_LIST_PERMISSION,
    );
    return useResponseSuccess(await ProcessMasterService.listForManagement());
  } catch (error: unknown) {
    logApiError('inspection-process-list', error, undefined, event);
    if (isBusinessError(error)) return businessErrorResponse(event, error);
    return internalServerErrorResponse(event, 'Failed to list processes');
  }
});
