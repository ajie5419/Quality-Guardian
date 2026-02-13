import { defineEventHandler } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import { isPrismaNotFoundError } from '~/utils/prisma-error';
import { getRequiredQueryParam } from '~/utils/query-param';
import {
  internalServerErrorResponse,
  notFoundResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  const id = getRequiredQueryParam(event, 'id', '缺少工单号');
  if (typeof id !== 'string') {
    return id;
  }

  try {
    // work_orders 表的主键是 workOrderNumber，不是 id
    await prisma.work_orders.update({
      where: { workOrderNumber: id },
      data: {
        isDeleted: true,
        updatedAt: new Date(),
      },
    });

    return useResponseSuccess(null);
  } catch (error) {
    logApiError('work-order', error);
    if (isPrismaNotFoundError(error)) {
      return notFoundResponse(event, '删除工单失败：记录不存在');
    }
    return internalServerErrorResponse(event, '删除工单失败');
  }
});
