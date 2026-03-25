import { defineEventHandler } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import {
  isPrismaNotFoundError,
  isPrismaSchemaMismatchError,
} from '~/utils/prisma-error';
import {
  badRequestResponse,
  internalServerErrorResponse,
  notFoundResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';

export default defineEventHandler(async (event) => {
  const userinfo = await verifyAccessToken(event);
  if (!userinfo) return unAuthorizedResponse(event);

  const id = getRequiredRouterParam(event, 'id', 'ID is required');
  if (typeof id !== 'string') {
    return id;
  }

  try {
    await prisma.inspection_form_templates.update({
      where: { id },
      data: {
        isDeleted: true,
        updatedAt: new Date(),
        updatedBy: userinfo.username,
      },
    });

    return useResponseSuccess({ message: 'Deleted' });
  } catch (error) {
    if (isPrismaSchemaMismatchError(error)) {
      return badRequestResponse(
        event,
        '数据库缺少检验表模块表，请先执行 db push',
      );
    }
    logApiError('inspection-form-delete', error);
    if (isPrismaNotFoundError(error)) {
      return notFoundResponse(event, '检验表不存在');
    }
    return internalServerErrorResponse(event, '删除检验表失败');
  }
});
