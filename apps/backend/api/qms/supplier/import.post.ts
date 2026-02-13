import { defineEventHandler, readBody, setResponseStatus } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import {
  unAuthorizedResponse,
  useResponseError,
  useResponseSuccess,
} from '~/utils/response';
import {
  createSupplierId,
  normalizeSupplierName,
  normalizeSupplierStatus,
  normalizeSupplierString,
} from '~/utils/supplier';

export default defineEventHandler(async (event) => {
  const userinfo = await verifyAccessToken(event);
  if (!userinfo) return unAuthorizedResponse(event);

  try {
    const body = await readBody(event);
    const { items, category } = body;

    if (!Array.isArray(items) || items.length === 0) {
      setResponseStatus(event, 400);
      return useResponseError('未选择数据');
    }

    let successCount = 0;
    for (const item of items) {
      try {
        const name = normalizeSupplierName(item.name);
        if (!name) continue;

        await prisma.suppliers.upsert({
          where: { name },
          update: {
            brand: normalizeSupplierString(item.brand),
            productName: normalizeSupplierString(item.productName),
            buyer: normalizeSupplierString(item.buyer),
            category:
              normalizeSupplierString(category) ||
              normalizeSupplierString(item.category),
            isDeleted: false,
          },
          create: {
            id: createSupplierId(),
            name,
            brand: normalizeSupplierString(item.brand),
            productName: normalizeSupplierString(item.productName),
            buyer: normalizeSupplierString(item.buyer),
            category:
              normalizeSupplierString(category) ||
              normalizeSupplierString(item.category) ||
              'Supplier',
            status: normalizeSupplierStatus(item.status),
          },
        });
        successCount++;
      } catch (error) {
        logApiError('import', error);
      }
    }

    return useResponseSuccess({ successCount, totalCount: items.length });
  } catch (error: unknown) {
    logApiError('import', error);
    setResponseStatus(event, 500);
    return useResponseError('导入异常');
  }
});
