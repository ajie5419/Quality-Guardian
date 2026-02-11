import { defineEventHandler, getQuery, readBody } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import {
  unAuthorizedResponse,
  useResponseError,
  useResponseSuccess,
} from '~/utils/response';
import { mapWorkOrderStatus } from '~/utils/work-order-status';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  // Use query param 'id' to handle special characters like '/'
  const query = getQuery(event);
  const id = String(query.id || '');

  if (!id) {
    return useResponseError('缺少工单号');
  }

  // No need to decode if using query params, usually handled by h3/framework
  // But just in case, ensure spacing is correct if needed, though raw query params are safer.

  try {
    const body = await readBody(event);

    // 局部更新逻辑
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (body.customerName !== undefined)
      updateData.customerName = body.customerName;
    if (body.division !== undefined) updateData.division = body.division;
    if (body.projectName !== undefined)
      updateData.projectName = body.projectName;
    if (body.quantity !== undefined && body.quantity !== null)
      updateData.quantity = Number(body.quantity);
    if (body.deliveryDate)
      updateData.deliveryDate = new Date(body.deliveryDate);
    if (body.effectiveTime)
      updateData.effectiveTime = new Date(body.effectiveTime);

    if (body.workOrderNumber && body.workOrderNumber !== id) {
      updateData.workOrderNumber = body.workOrderNumber;
    }

    if (body.status) {
      // 使用统一的状态映射工具
      updateData.status = mapWorkOrderStatus(body.status);
    }

    await prisma.work_orders.update({
      where: { workOrderNumber: id },
      data: updateData,
    });

    return useResponseSuccess(null);
  } catch (error: unknown) {
    logApiError('work-order', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    const errorCode = (error as { code?: string }).code;
    // Check for "Record to update not found"
    if (errorCode === 'P2025') {
      return useResponseError(`工单不存在: ${id}`);
    }
    return useResponseError(`更新工单失败: ${errorMessage}`);
  }
});
