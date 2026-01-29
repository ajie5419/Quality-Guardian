import {
  defineEventHandler,
  getRouterParam,
  readBody,
  setResponseStatus,
} from 'h3';
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

  const rawId = getRouterParam(event, 'id');
  if (!rawId) {
    return useResponseError('缺少工单号');
  }
  // Ensure ID is decoded (e.g. if passed as 23TL-CL%2F2501)
  const id = decodeURIComponent(rawId);

  try {
    const body = await readBody(event);

    // 局部更新逻辑
    const updateData: any = {
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

    if (body.status) {
      // 统一映射前端状态到数据库 Enum
      const s = body.status.toLowerCase();
      switch (s) {
        case 'closed': {
          updateData.status = 'COMPLETED';
          break;
        }
        case 'completed':
        case '已完成':
        case '已结束': {
          updateData.status = 'COMPLETED';
          break;
        }
        case 'in progress':
        case '进行中': {
          updateData.status = 'IN_PROGRESS';
          break;
        }
        case 'pending':
        case '未开始': {
          updateData.status = 'OPEN';
          break;
        }
        default: {
          updateData.status = 'OPEN';
        }
      }
    }

    await (prisma.work_orders as any).update({
      where: { workOrderNumber: id },
      data: updateData,
    });

    return useResponseSuccess(null);
  } catch (error: any) {
    console.error('Failed to update work order:', error);
    // Return specific error message for debugging
    // Check for "Record to update not found"
    if (error.code === 'P2025') {
       return useResponseError(`工单不存在: ${id}`);
    }
    return useResponseError(`更新工单失败: ${error.message}`);
  }
});
