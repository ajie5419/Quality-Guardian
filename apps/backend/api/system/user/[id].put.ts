import { defineEventHandler, readBody, setResponseStatus } from 'h3';
import { UserService } from '~/services/user.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  isPrismaNotFoundError,
  isPrismaUniqueConstraintError,
} from '~/utils/prisma-error';
import {
  unAuthorizedResponse,
  useResponseError,
  useResponseSuccess,
} from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
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
    logApiError('user', error);
    if (isPrismaUniqueConstraintError(error)) {
      setResponseStatus(event, 409);
      return useResponseError('用户名已存在');
    }
    setResponseStatus(event, isPrismaNotFoundError(error) ? 404 : 500);
    return useResponseError(
      isPrismaNotFoundError(error) ? '用户不存在' : '更新用户失败',
    );
  }
});
