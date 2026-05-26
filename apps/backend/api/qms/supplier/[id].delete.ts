import { defineEventHandler } from 'h3';
import { SupplierService } from '~/modules/supplier/supplier.service';
import { logApiError } from '~/utils/api-logger';
import { recordBusinessAuditLog } from '~/utils/audit-log';
import { getCurrentUser } from '~/utils/current-user';
import { isPrismaNotFoundError } from '~/utils/db-error';
import {
  internalServerErrorResponse,
  notFoundResponse,
  useResponseSuccess,
} from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';

export default defineEventHandler(async (event) => {
  const userinfo = getCurrentUser(event);

  const id = getRequiredRouterParam(event, 'id', '缺少供应商ID');
  if (typeof id !== 'string') {
    return id;
  }

  try {
    const deleted = await SupplierService.deleteSupplier(id);

    await recordBusinessAuditLog(event, {
      userId: userinfo.id,
      action: 'DELETE',
      targetType: 'supplier',
      targetId: String(id),
      detailsTemplate: '删除供应商/外协单位: {{name}}',
      detailsVariables: {
        name: deleted.name,
      },
    });

    return useResponseSuccess(null);
  } catch (error: unknown) {
    logApiError('supplier', error, undefined, event);
    if (isPrismaNotFoundError(error)) {
      return notFoundResponse(event, '供应商不存在');
    }
    return internalServerErrorResponse(event, '删除供应商失败');
  }
});
