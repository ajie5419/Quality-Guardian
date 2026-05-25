import { defineEventHandler, readBody } from 'h3';
import { RbacService } from '~/modules/rbac/rbac.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import { isPrismaUniqueConflictError } from '~/utils/db-error';
import {
  conflictResponse,
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';
import { requireSystemAdmin } from '~/utils/system-auth';

export default defineEventHandler(async (event) => {
  const userinfo = await verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }
  const adminCheck = requireSystemAdmin(event, userinfo);
  if (adminCheck) {
    return adminCheck;
  }

  try {
    return useResponseSuccess(
      await RbacService.createRole(await readBody(event)),
    );
  } catch (error) {
    logApiError('role', error, undefined, event);
    // Check for unique constraint violation
    if (isPrismaUniqueConflictError(error)) {
      return conflictResponse(event, '角色值已存在');
    }
    return internalServerErrorResponse(event, '创建角色失败');
  }
});
