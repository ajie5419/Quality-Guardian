import { defineEventHandler, readBody } from 'h3';
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
import {
  parseOptionalDate,
  parseRequiredDate,
  parseWorkOrderQuantity,
} from '~/utils/work-order';
import { mapWorkOrderStatus } from '~/utils/work-order-status';

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
    if (body.quantity !== undefined && body.quantity !== null) {
      updateData.quantity = parseWorkOrderQuantity(body.quantity, 1);
    }
    if (body.deliveryDate !== undefined && body.deliveryDate !== null) {
      updateData.deliveryDate = parseRequiredDate(body.deliveryDate);
    }
    if (body.effectiveTime !== undefined) {
      updateData.effectiveTime = parseOptionalDate(body.effectiveTime);
    }

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
    // Check for "Record to update not found"
    if (isPrismaNotFoundError(error)) {
      return notFoundResponse(event, `工单不存在: ${id}`);
    }
    return internalServerErrorResponse(event, `更新工单失败: ${errorMessage}`);
  }
});
