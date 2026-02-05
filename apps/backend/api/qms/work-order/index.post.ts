import { defineEventHandler, readBody } from 'h3';
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

    // 使用统一的状态映射工具
    const statusValue = mapWorkOrderStatus(body.status);

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

    // 格式化返回数据，将 UTC 时间转换为本地时间
    const formattedWO = {
      ...newWO,
      id: newWO.workOrderNumber,
      createTime: newWO.createdAt
        .toLocaleString('zh-CN', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        })
        .replaceAll('/', '-'),
    };

    return useResponseSuccess(formattedWO);
  } catch (error: unknown) {
    logApiError('work-order-create', error);
    const err = error as { code?: string; message?: string; meta?: unknown };
    const errorMessage = err.message || String(error);

    // Handle Prisma Unique Constraint Violation (P2002)
    const isUniqueError =
      err.code === 'P2002' || errorMessage.includes('Unique constraint failed');

    if (isUniqueError) {
      return useResponseError('工单号已存在，请使用其他编号');
    }

    // Handle Prisma Validation Errors (Missing Arguments etc.)
    if (
      err.code === 'P2011' ||
      err.code === 'P2012' ||
      errorMessage.includes('Argument')
    ) {
      // Try to extract the missing argument name if possible, or just give a generic validation error
      // Example msg: "Argument `customerName` is missing."
      const match = errorMessage.match(/Argument `(\w+)` is missing/);
      if (match && match[1]) {
        return useResponseError(`请求参数错误: 缺少必填字段 ${match[1]}`);
      }
      return useResponseError('请求参数错误: 数据格式不正确或缺少必填字段');
    }

    return useResponseError(`创建工单失败: ${errorMessage}`);
  }
});
