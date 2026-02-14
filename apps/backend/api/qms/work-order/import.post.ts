import { defineEventHandler, readBody } from 'h3';
import { logApiError } from '~/utils/api-logger';
import {
  buildImportRowError,
  buildImportSummary,
  inferImportErrorField,
  toImportErrorMessage,
} from '~/utils/import-report';
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
    const rowErrors = [];

    // 批量处理记录
    for (const [index, item] of items.entries()) {
      try {
        const woNumber = parseRequiredWorkOrderNumber(item.workOrderNumber);
        if (!woNumber) {
          rowErrors.push(
            buildImportRowError({
              field: 'workOrderNumber',
              item,
              keyField: 'workOrderNumber',
              reason: '工单号为空',
              row: index + 1,
              suggestion: '请填写有效工单号',
            }),
          );
          continue;
        }
        const deliveryDate = parseRequiredDate(item.deliveryDate);
        const effectiveTime = parseOptionalDate(item.effectiveTime);
        const status = mapWorkOrderStatus(item.status);

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
        const message = toImportErrorMessage(error);
        rowErrors.push(
          buildImportRowError({
            field: inferImportErrorField(message),
            item,
            keyField: 'workOrderNumber',
            reason: message,
            row: index + 1,
          }),
        );
      }
    }

    return useResponseSuccess(
      buildImportSummary({
        rowErrors,
        successCount,
        totalCount: items.length,
      }),
    );
  } catch (error: unknown) {
    logApiError('import', error);
    return internalServerErrorResponse(event, '数据处理异常');
  }
});
