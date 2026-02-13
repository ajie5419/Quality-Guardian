import {
  defineEventHandler,
  getRouterParam,
  readBody,
  setResponseStatus,
} from 'h3';
import { UserService } from '~/services/user.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
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

  const id = getRouterParam(event, 'id');
  if (!id) {
    setResponseStatus(event, 400);
    return useResponseError('缺少用户ID');
  }

  try {
    const body = await readBody(event);
    await UserService.update(id, body);
    return useResponseSuccess(null);
  } catch (error) {
    logApiError('user', error);
    const errorCode = (error as { code?: string }).code;
    if (errorCode === 'P2002') {
      setResponseStatus(event, 409);
      return useResponseError('用户名已存在');
    }
    setResponseStatus(event, errorCode === 'P2025' ? 404 : 500);
    return useResponseError(
      errorCode === 'P2025' ? '用户不存在' : '更新用户失败',
    );
  }
});
