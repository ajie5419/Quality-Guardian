import { defineEventHandler, getQuery } from 'h3';
import { SupplierService } from '~/modules/supplier/supplier.service';
import { recordBusinessAuditLog } from '~/modules/system-log';
import { logApiError } from '~/utils/api-logger';
import { businessErrorResponse, isBusinessError } from '~/utils/business-error';
import { getCurrentUser } from '~/utils/current-user';
import { requireExpectedVersionQuery } from '~/utils/optimistic-lock';
import { isPrismaNotFoundError } from '~/utils/prisma-error';
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
    // OPTIMISTIC-LOCK-001: user deletes carry the version the client read.
    const expectedVersion = requireExpectedVersionQuery(getQuery(event));
    const deleted = await SupplierService.deleteSupplier(id, expectedVersion, {
      scope: event.context.dataScope,
      user: userinfo,
    });

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
    if (isBusinessError(error)) return businessErrorResponse(event, error);
    if (isPrismaNotFoundError(error)) {
      return notFoundResponse(event, '供应商不存在');
    }
    return internalServerErrorResponse(event, '删除供应商失败');
  }
});
