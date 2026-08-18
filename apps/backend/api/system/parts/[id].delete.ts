import { getRouterParam } from 'h3';
import {
  assertPartMasterPermission,
  PART_MASTER_EDIT_PERMISSION,
  partMasterIdSchema,
  PartMasterService,
} from '~/modules/part-master';
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
    await assertPartMasterPermission(event, PART_MASTER_EDIT_PERMISSION);
    const id = partMasterIdSchema.parse(getRouterParam(event, 'id'));
    await PartMasterService.remove(id);
    return useResponseSuccess({ message: 'Material removed' });
  } catch (error: unknown) {
    logApiError('part-master-delete', error, undefined, event);
    if (isBusinessError(error)) return businessErrorResponse(event, error);
    return internalServerErrorResponse(event, 'Failed to remove material');
  }
});
