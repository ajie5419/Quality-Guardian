import { defineEventHandler, readBody } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { recordBusinessAuditLog } from '~/utils/audit-log';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import { parseNonEmptyArray } from '~/utils/request-validation';
import {
  badRequestResponse,
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';
import { buildSupplierUpsertPayload } from '~/utils/supplier';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  try {
    const body = await readBody(event);
    const items = parseNonEmptyArray<Record<string, unknown>>(body.items);

    if (!items) {
      return badRequestResponse(event, '无效的导入数据');
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
          const payload = buildSupplierUpsertPayload(item);
          if (!payload) {
            results.skipped++;
            return;
          }

          try {
            await prisma.suppliers.upsert(payload);
            results.success++;
          } catch (error) {
            logApiError('batch', error);
            results.errors++;
          }
        }),
      );
    }

    await recordBusinessAuditLog(event, {
      userId: userinfo.id,
      action: 'CREATE',
      targetType: 'supplier',
      targetId: 'batch-upsert',
      details: `批量导入供应商/外协单位: 成功 ${results.success} 条，跳过 ${results.skipped} 条，失败 ${results.errors} 条`,
    });

    return useResponseSuccess(results);
  } catch (error) {
    logApiError('batch', error);
    return internalServerErrorResponse(event, '批量导入失败');
  }
});
