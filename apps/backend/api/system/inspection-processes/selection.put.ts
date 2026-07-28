import {
  assertInspectionProcessPermission,
  inspectionRequestProcessSelectionSchema,
  PROCESS_SETTING_EDIT_PERMISSION,
  ProcessMasterService,
} from '~/modules/process-master';
import { logApiError } from '~/utils/api-logger';
import { businessErrorResponse, isBusinessError } from '~/utils/business-error';
import { defineValidatedHandler } from '~/utils/define-validated-handler';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineValidatedHandler(
  inspectionRequestProcessSelectionSchema,
  async (event, body) => {
    try {
      await assertInspectionProcessPermission(
        event,
        PROCESS_SETTING_EDIT_PERMISSION,
      );
      await ProcessMasterService.replaceInspectionRequestSelections(body);
      return useResponseSuccess({ message: 'Process selection saved' });
    } catch (error: unknown) {
      logApiError('inspection-process-selection', error, undefined, event);
      if (isBusinessError(error)) return businessErrorResponse(event, error);
      return internalServerErrorResponse(
        event,
        'Failed to save process selection',
      );
    }
  },
);
