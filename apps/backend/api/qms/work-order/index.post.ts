import { defineEventHandler, readBody } from 'h3';
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

  try {
    const body = await readBody(event);

    // Use existing ID logic or allow manual input?
    // Mock used: `WO-${new Date().getFullYear()}${Math.floor(Math.random() * 1000)}`
    // Schema: workOrderNumber String @id

    const woNum = body.workOrderNumber || `WO-${Date.now()}`;

    let statusValue = 'OPEN';
    if (body.status === '已结束' || body.status === '已完成') {
      statusValue = 'COMPLETED';
    } else if (body.status === '进行中') {
      statusValue = 'IN_PROGRESS';
    }

    const newWO = await prisma.work_orders.create({
      data: {
        workOrderNumber: woNum,
        customerName: body.customerName,
        projectName: body.projectName,
        division: body.division,
        quantity: Number(body.quantity) || 1,
        deliveryDate: new Date(body.deliveryDate || Date.now()),
        effectiveTime: body.effectiveTime ? new Date(body.effectiveTime) : null,
        status: statusValue,
        isDeleted: false,
        updatedAt: new Date(),
      },
    });

    return useResponseSuccess({ ...newWO, id: newWO.workOrderNumber });
  } catch (error) {
    console.error('Failed to create work order:', error);
    return useResponseError('创建工单失败');
  }
});
