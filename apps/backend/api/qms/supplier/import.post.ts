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
  const userinfo = await verifyAccessToken(event);
  if (!userinfo) return unAuthorizedResponse(event);

  try {
    const body = await readBody(event);
    const { items, category } = body;

    if (!Array.isArray(items) || items.length === 0) {
      return useResponseError('未选择数据');
    }

    let successCount = 0;
    for (const item of items) {
      try {
        const name = String(item.name || '').trim();
        if (!name) continue;

        const id = `SUP-${Date.now()}-${Math.random().toString(36).slice(-4)}`;

        await prisma.suppliers.upsert({
          where: { name },
          update: {
            brand: item.brand ? String(item.brand) : undefined,
            productName: item.productName
              ? String(item.productName)
              : undefined,
            buyer: item.buyer ? String(item.buyer) : undefined,
            category: category || item.category,
            isDeleted: false,
          },
          create: {
            id,
            name,
            brand: String(item.brand || ''),
            productName: String(item.productName || ''),
            buyer: String(item.buyer || ''),
            category: category || item.category || 'Supplier',
            status: 'Qualified',
          },
        });
        successCount++;
      } catch (error) {
        logApiError('import', error);
      }
    }

    return useResponseSuccess({ successCount, totalCount: items.length });
  } catch {
    return useResponseError('导入异常');
  }
});
