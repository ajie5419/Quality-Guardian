import bcrypt from 'bcrypt';
import { defineEventHandler } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import { isPrismaNotFoundError } from '~/utils/prisma-error';
import {
  internalServerErrorResponse,
  notFoundResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';
import { requireSystemAdmin } from '~/utils/system-auth';
import { getDefaultResetPassword } from '~/utils/user-security';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }
  const adminCheck = requireSystemAdmin(event, userinfo);
  if (adminCheck) {
    return adminCheck;
  }

  const id = getRequiredRouterParam(event, 'id', '缺少用户ID');
  if (typeof id !== 'string') {
    return id;
  }

  try {
    const hashedPassword = await bcrypt.hash(getDefaultResetPassword(), 12);

    await prisma.users.update({
      where: { id },
      data: {
        password: hashedPassword,
        updatedAt: new Date(),
      },
    });

    return useResponseSuccess(null);
  } catch (error) {
    logApiError('user-reset-password', error);
    if (isPrismaNotFoundError(error)) {
      return notFoundResponse(event, '用户不存在');
    }
    return internalServerErrorResponse(event, '重置密码失败');
  }
});
