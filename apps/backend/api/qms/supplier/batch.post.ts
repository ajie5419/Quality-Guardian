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
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  try {
    const body = await readBody(event);
    const { items } = body;

    if (!items || !Array.isArray(items)) {
      setResponseStatus(event, 400);
      return useResponseError('无效的导入数据');
    }

    const results = {
      success: 0,
      skipped: 0,
      errors: 0,
    };

    // 优化：分批并行处理，提高导入速度
    const chunkSize = 20; // SQLite 并发能力有限，不宜过大
    for (let i = 0; i < items.length; i += chunkSize) {
      const chunk = items.slice(i, i + chunkSize);

      await Promise.all(
        chunk.map(async (item) => {
          const name = normalizeSupplierName(item.name);
          if (!name) {
            results.errors++;
            return;
          }

          try {
            await prisma.suppliers.upsert({
              where: { name },
              update: {
                brand: normalizeSupplierString(item.brand),
                category: normalizeSupplierString(item.category),
                productName: normalizeSupplierString(item.productName),
                buyer: normalizeSupplierString(item.buyer),
                isDeleted: false, // 确保重新导入时恢复已删除的记录
                updatedAt: new Date(),
              },
              create: {
                id: createSupplierId(),
                name,
                brand: normalizeSupplierString(item.brand),
                category: normalizeSupplierString(item.category),
                productName: normalizeSupplierString(item.productName),
                buyer: normalizeSupplierString(item.buyer),
                status: normalizeSupplierStatus(item.status),
              },
            });
            results.success++;
          } catch (error) {
            logApiError('batch', error);
            results.errors++;
          }
        }),
      );
    }

    return useResponseSuccess(results);
  } catch (error) {
    logApiError('batch', error);
    setResponseStatus(event, 500);
    return useResponseError('批量导入失败');
  }
});
