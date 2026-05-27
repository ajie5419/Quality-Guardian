import { defineEventHandler } from 'h3';
import { DeptService } from '~/modules/dept';
import { requireSystemAdmin } from '~/modules/user/system-auth';
import { logApiError } from '~/utils/api-logger';
import { getCurrentUser } from '~/utils/current-user';
import { isPrismaNotFoundError } from '~/utils/prisma-error';
import {
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

  const id = getRequiredRouterParam(event, 'id', '缺少部门ID');
  if (typeof id !== 'string') {
    return id;
  }

  try {
    await DeptService.delete(id);
    return useResponseSuccess(null);
  } catch (error) {
    logApiError('dept', error, undefined, event);
    if (isPrismaNotFoundError(error)) {
      return notFoundResponse(event, '部门不存在');
    }
    return internalServerErrorResponse(event, '删除部门失败');
  }
});
