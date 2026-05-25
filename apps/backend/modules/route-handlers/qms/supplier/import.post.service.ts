import { defineEventHandler, readBody } from 'h3';
import { z } from 'zod';
import { SupplierService } from '~/modules/supplier/supplier.service';
import { logApiError } from '~/utils/api-logger';
import { recordBusinessAuditLog } from '~/utils/audit-log';
import { verifyAccessToken } from '~/utils/jwt-utils';
import { parseNonEmptyArray } from '~/utils/request-validation';
import {
  badRequestResponse,
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';

const importSupplierBodySchema = z.object({
  category: z.unknown().optional(),
  items: z.unknown(),
});

export default defineEventHandler(async (event) => {
  const userinfo = await verifyAccessToken(event);
  if (!userinfo) return unAuthorizedResponse(event);

  try {
    const body = importSupplierBodySchema.parse(await readBody(event));
    const items = parseNonEmptyArray<Record<string, unknown>>(body.items);

    if (!items) {
      return badRequestResponse(event, '未选择数据');
    }
    const result = await SupplierService.importSuppliers(items, body.category);

    await recordBusinessAuditLog(event, {
      userId: userinfo.id,
      action: 'CREATE',
      targetType: 'supplier',
      targetId: 'batch-import',
      detailsTemplate:
        '导入供应商/外协单位: {{successCount}}/{{totalCount}} 条',
      detailsVariables: {
        successCount: result.successCount,
        totalCount: result.totalCount,
      },
    });

    return useResponseSuccess(result);
  } catch (error: unknown) {
    logApiError('import', error, undefined, event);
    return internalServerErrorResponse(event, '导入异常');
  }
});
