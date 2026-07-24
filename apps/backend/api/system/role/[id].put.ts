import { defineEventHandler, readBody } from 'h3';
import { parseUpdateRoleInput, RbacService } from '~/modules/rbac';
import { requireSystemAdmin } from '~/modules/user/system-auth';
import { logApiError } from '~/utils/api-logger';
import {
  businessErrorResponse,
  legacyErrorToBusinessError,
} from '~/utils/business-error';
import { getCurrentUser } from '~/utils/current-user';
import {
  isPrismaNotFoundError,
  isPrismaUniqueConstraintError,
} from '~/utils/prisma-error';
import {
  conflictResponse,
  internalServerErrorResponse,
  notFoundResponse,
  useResponseSuccess,
} from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';

export default defineEventHandler(async (event) => {
  const userinfo = getCurrentUser(event);
  const adminCheck = requireSystemAdmin(event, userinfo);
  if (adminCheck) {
    return adminCheck;
  }

  const id = getRequiredRouterParam(event, 'id', '缺少角色ID');
  if (typeof id !== 'string') return id;

  try {
    await RbacService.updateRole(
      id,
      parseUpdateRoleInput(await readBody(event)),
    );
    return useResponseSuccess(null);
  } catch (error) {
    logApiError('role', error, undefined, event);
    const businessError = legacyErrorToBusinessError(error);
    if (businessError) return businessErrorResponse(event, businessError);
    if (isPrismaUniqueConstraintError(error)) {
      return conflictResponse(event, '角色值已存在');
    }
    if (isPrismaNotFoundError(error)) {
      return notFoundResponse(event, '角色不存在');
    }
    return internalServerErrorResponse(event, '更新角色失败');
  }
});
