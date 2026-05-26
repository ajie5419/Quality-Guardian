import { defineEventHandler, readBody } from 'h3';
import { z } from 'zod';
import { SupplierService } from '~/modules/supplier/supplier.service';
import { recordBusinessAuditLog } from '~/modules/system-log/audit-log';
import { logApiError } from '~/utils/api-logger';
import { getCurrentUser } from '~/utils/current-user';
import { parseNonEmptyArray } from '~/utils/request-validation';
import {
  badRequestResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

const batchUpsertBodySchema = z.object({ items: z.unknown() });

export default defineEventHandler(async (event) => {
  const userinfo = getCurrentUser(event);

  try {
    const body = batchUpsertBodySchema.parse(await readBody(event));
    const items = parseNonEmptyArray<Record<string, unknown>>(body.items);

    if (!items) {
      return badRequestResponse(event, '无效的导入数据');
    }

    const results = await SupplierService.batchUpsertSuppliers(items);

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
