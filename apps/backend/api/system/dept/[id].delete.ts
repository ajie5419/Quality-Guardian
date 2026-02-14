import { defineEventHandler } from 'h3';
import { DeptService } from '~/services/dept.service';
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

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  const id = getRequiredRouterParam(event, 'id', '缺少部门ID');
  if (typeof id !== 'string') {
    return id;
  }

  try {
    await DeptService.delete(id);
    return useResponseSuccess(null);
  } catch (error) {
    logApiError('dept', error);
    if (isPrismaNotFoundError(error)) {
      return notFoundResponse(event, '部门不存在');
    }
    return internalServerErrorResponse(event, '删除部门失败');
  }
});
