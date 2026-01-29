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

    // Schema: workOrderNumber String @id
    const rawWoNum = body.workOrderNumber;
    const woNum = rawWoNum ? String(rawWoNum).trim() : `WO-${Date.now()}`;

    // Check for duplicate ID
    const existing = await prisma.work_orders.findUnique({
      where: { workOrderNumber: woNum },
    });
    
    if (existing) {
      return useResponseError(`工单号 ${woNum} 已存在，请使用其他编号`);
    }

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
  } catch (error: any) {
    console.error(
      'Failed to create work order:',
      JSON.stringify(
        {
          message: error.message,
          code: error.code,
          meta: error.meta,
        },
        null,
        2,
      ),
    );

    // Handle Prisma Unique Constraint Violation (P2002)
    const isUniqueError =
      error.code === 'P2002' ||
      String(error.message).includes('Unique constraint failed') ||
      String(error).includes('Unique constraint failed');

    if (isUniqueError) {
      return useResponseError('工单号已存在，请使用其他编号');
    }

    return useResponseError(`创建工单失败: ${error.message || String(error)}`);
  }
});
