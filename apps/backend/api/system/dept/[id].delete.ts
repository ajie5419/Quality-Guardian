import { defineEventHandler, getRouterParam } from 'h3';
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
    await DeptService.delete(id);
    return useResponseSuccess(null);
  } catch (error) {
    logApiError('dept', error);
    return useResponseError('删除部门失败');
  }
});
