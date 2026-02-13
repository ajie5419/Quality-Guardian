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
  buildSupplierUpsertPayload,
  normalizeSupplierString,
} from '~/utils/supplier';

export default defineEventHandler(async (event) => {
  const userinfo = await verifyAccessToken(event);
  if (!userinfo) return unAuthorizedResponse(event);

  try {
    const body = await readBody(event);
    const items = parseNonEmptyArray<Record<string, unknown>>(body.items);
    const { category } = body;

    if (!items) {
      return badRequestResponse(event, '未选择数据');
    }

    const normalizedCategory = normalizeSupplierString(category);
    let successCount = 0;
    for (const item of items) {
      try {
        const payload = buildSupplierUpsertPayload(item, {
          category: normalizedCategory,
        });
        if (!payload) continue;

        await prisma.suppliers.upsert(payload);
        successCount++;
      } catch (error) {
        logApiError('import', error);
      }
    }

    return useResponseSuccess({ successCount, totalCount: items.length });
  } catch (error: unknown) {
    logApiError('import', error);
    return internalServerErrorResponse(event, '导入异常');
  }
});
