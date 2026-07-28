import { getRouterParam } from 'h3';
import {
  assertInspectionProcessPermission,
  PROCESS_SETTING_EDIT_PERMISSION,
  processMasterIdSchema,
  ProcessMasterService,
  processMasterUpdateSchema,
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
  processMasterUpdateSchema,
  async (event, body) => {
    try {
      await assertInspectionProcessPermission(
        event,
        PROCESS_SETTING_EDIT_PERMISSION,
      );
      const id = processMasterIdSchema.parse(getRouterParam(event, 'id'));
      return useResponseSuccess(await ProcessMasterService.update(id, body));
    } catch (error: unknown) {
      logApiError('inspection-process-update', error, undefined, event);
      if (isBusinessError(error)) return businessErrorResponse(event, error);
      if (isPrismaUniqueConflictError(error)) {
        return conflictResponse(event, 'Process name already exists');
      }
      return internalServerErrorResponse(event, 'Failed to update process');
    }
  },
);
