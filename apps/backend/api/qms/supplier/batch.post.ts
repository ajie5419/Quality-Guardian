import { defineEventHandler, readBody } from 'h3';
import { buildGovernedCanonicalWritePairForTable } from '~/core/master-data/governance-write';
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
            const createCanonicalIds =
              await buildGovernedCanonicalWritePairForTable(
                'suppliers',
                payload.create,
              );
            const updateCanonicalIds =
              await buildGovernedCanonicalWritePairForTable(
                'suppliers',
                payload.update,
              );
            payload.create = {
              ...payload.create,
              ...createCanonicalIds,
            };
            payload.update = {
              ...payload.update,
              ...updateCanonicalIds,
            };
            await prisma.suppliers.upsert(payload);
            results.success++;
          } catch (error) {
            logApiError('batch', error, undefined, event);
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
      detailsTemplate:
        '批量导入供应商/外协单位: 成功 {{success}} 条，跳过 {{skipped}} 条，失败 {{errors}} 条',
      detailsVariables: {
        errors: results.errors,
        skipped: results.skipped,
        success: results.success,
      },
    });

    return useResponseSuccess(results);
  } catch (error) {
    logApiError('batch', error, undefined, event);
    return internalServerErrorResponse(event, '批量导入失败');
  }
});
