import { PERMISSION_CODES } from '@qgs/shared';
import { defineEventHandler, readBody } from 'h3';
import { z } from 'zod';
import { authorizeWrite } from '~/modules/rbac';
import { SupplierService } from '~/modules/supplier/supplier.service';
import { recordBusinessAuditLog } from '~/modules/system-log/audit-log';
import { logApiError, logApiWarn } from '~/utils/api-logger';
import { businessErrorResponse, isBusinessError } from '~/utils/business-error';
import { getCurrentUser } from '~/utils/current-user';
import {
  badRequestResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

const createSupplierBodySchema = z.object({}).passthrough();

export default defineEventHandler(async (event) => {
  await authorizeWrite(event, PERMISSION_CODES.QMS.SUPPLIER.CREATE);
  const userinfo = getCurrentUser(event);

  try {
    const body = createSupplierBodySchema.parse(await readBody(event));
    const outcome = await SupplierService.createSupplierWithOutcome(body);
    if (!outcome) {
      return badRequestResponse(event, '缺少必填字段: name');
    }
    const { action, supplier } = outcome;

    await recordBusinessAuditLog(event, {
      userId: userinfo.id,
      action,
      targetType: 'supplier',
      targetId: String(supplier.id),
      detailsTemplate: '保存供应商/外协单位: {{name}}',
      detailsVariables: {
        name: supplier.name,
      },
    });

    return useResponseSuccess(supplier);
  } catch (error: unknown) {
    if (isBusinessError(error)) {
      logApiWarn('supplier', error.code, undefined, event);
      return businessErrorResponse(event, error);
    }
    logApiError('supplier', error, undefined, event);
    return internalServerErrorResponse(event, '创建供应商失败');
  }
});
