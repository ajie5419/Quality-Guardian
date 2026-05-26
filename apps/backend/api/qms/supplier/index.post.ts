import { defineEventHandler, readBody } from 'h3';
import { z } from 'zod';
import { SupplierService } from '~/modules/supplier/supplier.service';
import { recordBusinessAuditLog } from '~/modules/system-log/audit-log';
import { logApiError } from '~/utils/api-logger';
import { getCurrentUser } from '~/utils/current-user';
import { isPrismaUniqueConstraintError } from '~/utils/db-error';
import {
  badRequestResponse,
  conflictResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

const createSupplierBodySchema = z.object({}).passthrough();

export default defineEventHandler(async (event) => {
  const userinfo = getCurrentUser(event);

  try {
    const body = createSupplierBodySchema.parse(await readBody(event));
    const newSupplier = await SupplierService.createSupplier(body);
    if (!newSupplier) {
      return badRequestResponse(event, '缺少必填字段: name');
    }

    await recordBusinessAuditLog(event, {
      userId: userinfo.id,
      action: 'CREATE',
      targetType: 'supplier',
      targetId: String(newSupplier.id),
      detailsTemplate: '新增供应商/外协单位: {{name}}',
      detailsVariables: {
        name: newSupplier.name,
      },
    });

    return useResponseSuccess(newSupplier);
  } catch (error: unknown) {
    logApiError('supplier', error, undefined, event);
    if (isPrismaUniqueConstraintError(error)) {
      return conflictResponse(event, '供应商名称已存在');
    }
    return internalServerErrorResponse(event, '创建供应商失败');
  }
});
