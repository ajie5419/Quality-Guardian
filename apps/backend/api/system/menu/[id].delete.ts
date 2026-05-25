import { defineEventHandler } from 'h3';
import { RbacService } from '~/modules/rbac/rbac.service';
import { logApiError } from '~/utils/api-logger';
import { isPrismaNotFoundError } from '~/utils/db-error';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  internalServerErrorResponse,
  notFoundResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';
import { requireSystemAdmin } from '~/utils/system-auth';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }
  const adminCheck = requireSystemAdmin(event, userinfo);
  if (adminCheck) {
    return adminCheck;
  }

  const id = getRequiredRouterParam(event, 'id', '缺少菜单ID');
  if (typeof id !== 'string') {
    return id;
  }

  try {
    await RbacService.softDeleteMenu(id);
    return useResponseSuccess(null);
  } catch (error) {
    logApiError('menu', error, undefined, event);
    if (isPrismaNotFoundError(error)) {
      return notFoundResponse(event, '菜单不存在');
    }
    return internalServerErrorResponse(event, '删除菜单失败');
  }
});
