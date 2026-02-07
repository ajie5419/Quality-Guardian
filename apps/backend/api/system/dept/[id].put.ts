import { defineEventHandler, getRouterParam, readBody } from 'h3';
import { DeptService } from '~/services/dept.service';
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
    return useResponseError('缺少部门ID');
  }

  try {
    const body = await readBody(event);
    await DeptService.update(id, body);
    return useResponseSuccess(null);
  } catch (error) {
    logApiError('dept', error);
    return useResponseError('更新部门失败');
  }
});
