import { defineEventHandler, readBody } from 'h3';
import { RbacService } from '~/modules/rbac/rbac.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  isPrismaNotFoundError,
  isPrismaUniqueConstraintError,
} from '~/utils/db-error';
import {
  conflictResponse,
  internalServerErrorResponse,
  notFoundResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';
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

  const id = getRequiredRouterParam(event, 'id', '缺少角色ID');
  if (typeof id !== 'string') {
    return id;
  }

  try {
    await RbacService.updateRole(id, await readBody(event));
    return useResponseSuccess(null);
  } catch (error) {
    logApiError('role', error, undefined, event);
    if (isPrismaUniqueConstraintError(error)) {
      return conflictResponse(event, '角色值已存在');
    }
    if (isPrismaNotFoundError(error)) {
      return notFoundResponse(event, '角色不存在');
    }
    return internalServerErrorResponse(event, '更新角色失败');
  }
});
