import { defineEventHandler, readBody } from 'h3';
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

  try {
    const body = await readBody(event);
    const { items } = body;

    if (!Array.isArray(items) || items.length === 0) {
      return useResponseError('未发现可导入的数据');
    }

    let successCount = 0;
    const errors: string[] = [];

    // 批量处理记录
    for (const item of items) {
      try {
        const woNumber = String(item.workOrderNumber || '').trim();
        if (!woNumber) continue;

        // 处理交货日期
        let deliveryDate = new Date();
        if (item.deliveryDate) {
          const d = new Date(item.deliveryDate);
          if (!Number.isNaN(d.getTime())) {
            deliveryDate = d;
          }
        }

        // 处理生效日期
        let effectiveTime: Date | null = null;
        if (item.effectiveTime) {
          const d = new Date(item.effectiveTime);
          if (!Number.isNaN(d.getTime())) {
            effectiveTime = d;
          }
        }

        // 处理状态
        let status: any;
        if (item.status) {
          const s = String(item.status).toUpperCase();
          if (['CANCELLED', 'COMPLETED', 'IN_PROGRESS', 'OPEN'].includes(s)) {
            status = s;
          }
        }

        await prisma.work_orders.upsert({
          where: { workOrderNumber: woNumber },
          update: {
            customerName: item.customerName
              ? String(item.customerName)
              : undefined,
            projectName: item.projectName
              ? String(item.projectName)
              : undefined,
            division: item.division ? String(item.division) : undefined,
            quantity: item.quantity ? Number(item.quantity) : undefined,
            deliveryDate,
            effectiveTime,
            status,
            isDeleted: false,
          },
          create: {
            workOrderNumber: woNumber,
            customerName: String(item.customerName || '未知客户'),
            projectName: String(item.projectName || ''),
            division: String(item.division || ''),
            quantity: Number(item.quantity) || 1,
            deliveryDate,
            effectiveTime,
            status: status || 'OPEN',
          },
        });
        successCount++;
      } catch (error: any) {
        logApiError('import', error);
        errors.push(`${item.workOrderNumber}: ${error.message}`);
      }
    }

    return useResponseSuccess({
      successCount,
      totalCount: items.length,
      errorCount: errors.length,
      errors: errors.slice(0, 10), // 返回前10条错误
    });
  } catch (error: any) {
    logApiError('import', error);
    return useResponseError('数据处理异常');
  }
});
