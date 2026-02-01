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

    if (!items || !Array.isArray(items)) {
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
          if (!item.name) {
            results.errors++;
            return;
          }

          try {
            // 生成唯一 ID (避免前端未传 ID 时的问题)
            const id = `SUP-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

            await prisma.suppliers.upsert({
              where: { name: item.name },
              update: {
                brand: item.brand || undefined,
                category: item.category || undefined,
                productName: item.productName || undefined,
                buyer: item.buyer || undefined,
                isDeleted: false, // 确保重新导入时恢复已删除的记录
                updatedAt: new Date(),
              },
              create: {
                id,
                name: item.name,
                brand: item.brand,
                category: item.category,
                productName: item.productName,
                buyer: item.buyer,
                status: 'Qualified',
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
    return useResponseError('批量导入失败');
  }
});
