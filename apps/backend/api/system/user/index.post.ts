import { defineEventHandler, readBody } from 'h3';
import { UserService } from '~/services/user.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import { isPrismaUniqueConflictError } from '~/utils/prisma-error';
import {
  conflictResponse,
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';
import { requireSystemAdmin } from '~/utils/system-auth';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }
  const adminCheck = requireSystemAdmin(event, userinfo);
  if (adminCheck) {
    return adminCheck;
  }

  try {
    const body = await readBody(event);
    const result = await UserService.create(body);
    return useResponseSuccess(result);
  } catch (error) {
    logApiError('user', error);
    if (isPrismaUniqueConflictError(error)) {
      return conflictResponse(event, '用户名已存在');
    }
    return internalServerErrorResponse(event, '创建用户失败');
  }
});
