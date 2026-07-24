import { defineEventHandler, readBody } from 'h3';
import { parseCreateRoleInput, RbacService } from '~/modules/rbac';
import { requireSystemAdmin } from '~/modules/user/system-auth';
import { logApiError } from '~/utils/api-logger';
import {
  businessErrorResponse,
  legacyErrorToBusinessError,
} from '~/utils/business-error';
import { getCurrentUser } from '~/utils/current-user';
import { isPrismaUniqueConflictError } from '~/utils/prisma-error';
import {
  conflictResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = getCurrentUser(event);
  const adminCheck = requireSystemAdmin(event, userinfo);
  if (adminCheck) {
    return adminCheck;
  }

  try {
    return useResponseSuccess(
      await RbacService.createRole(parseCreateRoleInput(await readBody(event))),
    );
  } catch (error) {
    logApiError('role', error, undefined, event);
    const businessError = legacyErrorToBusinessError(error);
    if (businessError) return businessErrorResponse(event, businessError);
    // Check for unique constraint violation
    if (isPrismaUniqueConflictError(error)) {
      return conflictResponse(event, '角色值已存在');
    }
    return internalServerErrorResponse(event, '创建角色失败');
  }
});
