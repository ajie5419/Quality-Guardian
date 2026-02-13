import { defineEventHandler, readBody } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import { parseNonEmptyArray } from '~/utils/request-validation';
import {
  badRequestResponse,
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';
import {
  parseOptionalDate,
  parseRequiredDate,
  parseRequiredWorkOrderNumber,
  parseWorkOrderQuantity,
} from '~/utils/work-order';
import { mapWorkOrderStatus } from '~/utils/work-order-status';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  try {
    const body = await readBody(event);
    const items = parseNonEmptyArray<Record<string, unknown>>(body.items);

    if (!items) {
      return badRequestResponse(event, '未发现可导入的数据');
    }

    let successCount = 0;
    const errors: string[] = [];

    // 批量处理记录
    for (const item of items) {
      try {
        const woNumber = parseRequiredWorkOrderNumber(item.workOrderNumber);
        if (!woNumber) continue;
        const deliveryDate = parseRequiredDate(item.deliveryDate);
        const effectiveTime = parseOptionalDate(item.effectiveTime);
        const status =
          item.status === undefined || item.status === null
            ? mapWorkOrderStatus(undefined)
            : mapWorkOrderStatus(String(item.status));

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
            quantity:
              item.quantity !== undefined && item.quantity !== null
                ? parseWorkOrderQuantity(item.quantity, 1)
                : undefined,
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
            quantity: parseWorkOrderQuantity(item.quantity, 1),
            deliveryDate,
            effectiveTime,
            status,
          },
        });
        successCount++;
      } catch (error: unknown) {
        logApiError('import', error);
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        errors.push(`${String(item.workOrderNumber ?? '')}: ${errorMessage}`);
      }
    }

    return useResponseSuccess({
      successCount,
      totalCount: items.length,
      errorCount: errors.length,
      errors: errors.slice(0, 10), // 返回前10条错误
    });
  } catch (error: unknown) {
    logApiError('import', error);
    return internalServerErrorResponse(event, '数据处理异常');
  }
});
