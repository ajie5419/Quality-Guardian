import { getRouterParam } from 'h3';
import {
  assertInspectionProcessPermission,
  PROCESS_SETTING_EDIT_PERMISSION,
  processMasterIdSchema,
  ProcessMasterService,
} from '~/modules/process-master';
import { requireSystemAdmin } from '~/modules/user/system-auth';
import { logApiError } from '~/utils/api-logger';
import { businessErrorResponse, isBusinessError } from '~/utils/business-error';
import { getCurrentUser } from '~/utils/current-user';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const adminCheck = requireSystemAdmin(event, getCurrentUser(event));
  if (adminCheck) return adminCheck;
  try {
    await assertInspectionProcessPermission(
      event,
      PROCESS_SETTING_EDIT_PERMISSION,
    );
    const id = processMasterIdSchema.parse(getRouterParam(event, 'id'));
    await ProcessMasterService.remove(id);
    return useResponseSuccess({ message: 'Process removed' });
  } catch (error: unknown) {
    logApiError('inspection-process-delete', error, undefined, event);
    if (isBusinessError(error)) return businessErrorResponse(event, error);
    return internalServerErrorResponse(event, 'Failed to remove process');
  }
});
