import { defineEventHandler, readBody } from 'h3';
import { requireSystemAdmin } from '~/modules/user/system-auth';
import { UserService } from '~/modules/user/user.service';
import { logApiError } from '~/utils/api-logger';
import { getCurrentUser } from '~/utils/current-user';
import {
  isPrismaNotFoundError,
  isPrismaUniqueConstraintError,
} from '~/utils/db-error';
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

  const id = getRequiredRouterParam(event, 'id', '缺少用户ID');
  if (typeof id !== 'string') {
    return id;
  }

  try {
    const body = await readBody(event);
    await UserService.update(id, body);
    return useResponseSuccess(null);
  } catch (error) {
    logApiError('user', error, undefined, event);
    if (isPrismaUniqueConstraintError(error)) {
      return conflictResponse(event, '用户名已存在');
    }
    if (isPrismaNotFoundError(error)) {
      return notFoundResponse(event, '用户不存在');
    }
    return internalServerErrorResponse(event, '更新用户失败');
  }
});
