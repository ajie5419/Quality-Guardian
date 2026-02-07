import { defineEventHandler, getRouterParam } from 'h3';
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
    return useResponseError('缺少用户ID');
  }

  try {
    await UserService.delete(id);
    return useResponseSuccess(null);
  } catch (error) {
    logApiError('user', error);
    return useResponseError('删除用户失败');
  }
});
