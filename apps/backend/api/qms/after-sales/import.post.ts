import { defineEventHandler, readBody, setResponseStatus } from 'h3';
import {
  createAfterSalesId,
  getNextAfterSalesSerialNumber,
} from '~/utils/after-sales-id';
import { buildAfterSalesCreateData } from '~/utils/after-sales-payload';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import {
  unAuthorizedResponse,
  useResponseError,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = await verifyAccessToken(event);
  if (!userinfo) return unAuthorizedResponse(event);

  try {
    const body = await readBody(event);
    const { items } = body;

    if (!Array.isArray(items) || items.length === 0) {
      setResponseStatus(event, 400);
      return useResponseError('未选择数据');
    }

    let successCount = 0;
    let serialSeed = await getNextAfterSalesSerialNumber();
    for (const item of items) {
      try {
        const woNumber = String(item.workOrderNumber || '').trim();
        if (!woNumber) continue;
        const serialNumber = serialSeed++;

        await prisma.after_sales.create({
          data: buildAfterSalesCreateData(item as Record<string, unknown>, {
            defaultWorkOrderNumber: woNumber,
            id: createAfterSalesId(),
            serialNumber,
          }),
        });
        successCount++;
      } catch (error) {
        logApiError('import', error);
      }
    }

    return useResponseSuccess({ successCount, totalCount: items.length });
  } catch (error: unknown) {
    logApiError('after-sales-import', error);
    setResponseStatus(event, 500);
    return useResponseError('导入异常');
  }
});
