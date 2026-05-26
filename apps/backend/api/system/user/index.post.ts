import { defineEventHandler, readBody } from 'h3';
import { requireSystemAdmin } from '~/modules/user/system-auth';
import { UserService } from '~/modules/user/user.service';
import { logApiError } from '~/utils/api-logger';
import { getCurrentUser } from '~/utils/current-user';
import { isPrismaUniqueConflictError } from '~/utils/db-error';
import {
  conflictResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = getCurrentUser(event);
  const adminCheck = requireSystemAdmin(event, userinfo);
  if (adminCheck) {
    return adminCheck;
  }

  try {
    const body = await readBody(event);
    const result = await UserService.create(body);
    return useResponseSuccess(result);
  } catch (error) {
    logApiError('user', error, undefined, event);
    if (isPrismaUniqueConflictError(error)) {
      return conflictResponse(event, '用户名已存在');
    }
    return internalServerErrorResponse(event, '创建用户失败');
  }
});
