import { defineEventHandler, readBody } from 'h3';
import { z } from 'zod';
import { SupplierService } from '~/modules/supplier/supplier.service';
import { recordBusinessAuditLog } from '~/modules/system-log/audit-log';
import { logApiError } from '~/utils/api-logger';
import { getCurrentUser } from '~/utils/current-user';
import { parseNonEmptyIdList } from '~/utils/id-list';
import {
  badRequestResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

const batchDeleteBodySchema = z.object({ ids: z.unknown() });

export default defineEventHandler(async (event) => {
  const userinfo = getCurrentUser(event);

  try {
    const body = batchDeleteBodySchema.parse(await readBody(event));
    const ids = parseNonEmptyIdList(body.ids);

    if (!ids) {
      return badRequestResponse(event, '请提供有效的 ID 列表');
    }

    const result = await SupplierService.batchDeleteSuppliers(ids);

    await recordBusinessAuditLog(event, {
      userId: userinfo.id,
      action: 'DELETE',
      targetType: 'supplier',
      targetId: ids.join(','),
      detailsTemplate: '批量删除供应商/外协单位: {{count}} 条',
      detailsVariables: {
        count: result.count,
      },
    });

    return useResponseSuccess({ count: result.count });
  } catch (error) {
    logApiError('batch-delete', error, undefined, event);
    return internalServerErrorResponse(event, '批量删除失败');
  }
});
