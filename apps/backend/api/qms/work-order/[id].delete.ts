import { defineEventHandler, getRouterParam } from 'h3';
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

  // 解码 URL 编码的参数（处理工单号中的特殊字符如 '/'）
  const id = decodeURIComponent(getRouterParam(event, 'id') || '');
  if (!id) {
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
    return useResponseError('删除工单失败：记录不存在');
  }
});
