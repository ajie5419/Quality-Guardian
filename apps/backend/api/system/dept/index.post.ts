import { defineEventHandler, readBody } from 'h3';
import { DeptService } from '~/services/dept.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import { isPrismaUniqueConstraintError } from '~/utils/prisma-error';
import {
  conflictResponse,
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  try {
    const body = await readBody(event);
    const newDept = await DeptService.create(body);
    return useResponseSuccess(newDept);
  } catch (error) {
    logApiError('dept', error);
    if (isPrismaUniqueConstraintError(error)) {
      return conflictResponse(event, '部门名称已存在');
    }
    return internalServerErrorResponse(event, '创建部门失败');
  }
});
