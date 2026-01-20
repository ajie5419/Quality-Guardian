import { defineEventHandler, getRouterParam } from 'h3';
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

  const id = getRouterParam(event, 'id');
  if (!id) {
    return useResponseError('缺少工单号');
  }

  try {
    await prisma.work_orders.update({
      where: { workOrderNumber: id },
      data: {
        isDeleted: true,
        updatedAt: new Date(),
      },
    });

    return useResponseSuccess(null);
  } catch (error) {
    console.error('Failed to delete work order:', error);
    return useResponseError('删除工单失败');
  }
});
