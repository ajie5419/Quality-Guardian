import { defineEventHandler, getQuery, setResponseStatus } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
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

  // Use query param 'id' to handle special characters like '/'
  const query = getQuery(event);
  const id = String(query.id || '');

  if (!id) {
    setResponseStatus(event, 400);
    return useResponseError('缺少工单号');
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
    const errorCode = (error as { code?: string }).code;
    setResponseStatus(event, errorCode === 'P2025' ? 404 : 500);
    return useResponseError('删除工单失败：记录不存在');
  }
});
