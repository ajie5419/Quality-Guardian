import { defineEventHandler } from 'h3';
import { UserService } from '~/services/user.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import { isPrismaNotFoundError } from '~/utils/prisma-error';
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

  const id = getRequiredRouterParam(event, 'id', '缺少用户ID');
  if (typeof id !== 'string') {
    return id;
  }

  try {
    await UserService.delete(id);
    return useResponseSuccess(null);
  } catch (error) {
    logApiError('user', error);
    if (isPrismaNotFoundError(error)) {
      return notFoundResponse(event, '用户不存在');
    }
    return internalServerErrorResponse(event, '删除用户失败');
  }
});
