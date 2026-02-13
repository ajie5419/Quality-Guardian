import { defineEventHandler, readBody, setResponseStatus } from 'h3';
import { UserService } from '~/services/user.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import { isPrismaUniqueConstraintError } from '~/utils/prisma-error';
import {
  unAuthorizedResponse,
  useResponseError,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  try {
    const body = await readBody(event);
    const result = await UserService.create(body);
    return useResponseSuccess(result);
  } catch (error) {
    logApiError('user', error);
    if (
      isPrismaUniqueConstraintError(error) ||
      String(error).includes('Unique constraint')
    ) {
      setResponseStatus(event, 409);
      return useResponseError('用户名已存在');
    }
    setResponseStatus(event, 500);
    return useResponseError('创建用户失败');
  }
});
