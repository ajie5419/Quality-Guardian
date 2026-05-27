import { defineEventHandler, readBody } from 'h3';
import { z } from 'zod';
import { SupplierService } from '~/modules/supplier/supplier.service';
import { recordBusinessAuditLog } from '~/modules/system-log/audit-log';
import { logApiError } from '~/utils/api-logger';
import { getCurrentUser } from '~/utils/current-user';
import {
  isPrismaNotFoundError,
  isPrismaUniqueConstraintError,
} from '~/utils/prisma-error';
import {
  conflictResponse,
  internalServerErrorResponse,
  notFoundResponse,
  useResponseSuccess,
} from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';

const updateSupplierBodySchema = z.object({}).passthrough();

export default defineEventHandler(async (event) => {
  const userinfo = getCurrentUser(event);

  const id = getRequiredRouterParam(event, 'id', '缺少供应商ID');
  if (typeof id !== 'string') return id;

  try {
    const body = updateSupplierBodySchema.parse(await readBody(event));
    const updated = await SupplierService.updateSupplier(id, body);

    await recordBusinessAuditLog(event, {
      userId: userinfo.id,
      action: 'UPDATE',
      targetType: 'supplier',
      targetId: String(id),
      detailsTemplate: '修改供应商/外协单位: {{name}}',
      detailsVariables: { name: updated.name },
    });

    return useResponseSuccess(null);
  } catch (error: unknown) {
    logApiError('supplier', error, undefined, event);
    if (isPrismaNotFoundError(error)) {
      return notFoundResponse(event, '供应商不存在');
    }
    if (isPrismaUniqueConstraintError(error)) {
      return conflictResponse(event, '供应商名称已存在');
    }
    return internalServerErrorResponse(event, '更新供应商失败');
  }
});
