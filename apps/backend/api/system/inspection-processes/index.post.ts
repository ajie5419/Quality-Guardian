import {
  assertInspectionProcessPermission,
  PROCESS_SETTING_EDIT_PERMISSION,
  processMasterCreateSchema,
  ProcessMasterService,
} from '~/modules/process-master';
import { logApiError } from '~/utils/api-logger';
import { businessErrorResponse, isBusinessError } from '~/utils/business-error';
import { defineValidatedHandler } from '~/utils/define-validated-handler';
import { isPrismaUniqueConflictError } from '~/utils/prisma-error';
import {
  conflictResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineValidatedHandler(
  processMasterCreateSchema,
  async (event, body) => {
    try {
      await assertInspectionProcessPermission(
        event,
        PROCESS_SETTING_EDIT_PERMISSION,
      );
      return useResponseSuccess(await ProcessMasterService.create(body));
    } catch (error: unknown) {
      logApiError('inspection-process-create', error, undefined, event);
      if (isBusinessError(error)) return businessErrorResponse(event, error);
      if (isPrismaUniqueConflictError(error)) {
        return conflictResponse(event, 'Process name already exists');
      }
      return internalServerErrorResponse(event, 'Failed to create process');
    }
  },
);
