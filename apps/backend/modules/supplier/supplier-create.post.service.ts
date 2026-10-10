import type { UserSession } from '~/utils/jwt-utils';

import { PERMISSION_CODES } from '@qgs/shared';
import { defineEventHandler, readBody } from 'h3';
import { z } from 'zod';
import { RbacRoleService } from '~/modules/rbac';
import { SupplierService } from '~/modules/supplier/supplier.service';
import { recordBusinessAuditLog } from '~/modules/system-log';
import { logApiError, logApiWarn } from '~/utils/api-logger';
import { businessErrorResponse, isBusinessError } from '~/utils/business-error';
import {
  badRequestResponse,
  forbiddenResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

const createSupplierBodySchema = z.object({}).passthrough();

export async function handleSupplierCreate(
  event: Parameters<typeof defineEventHandler>[0] extends (
    e: infer E,
  ) => unknown
    ? E
    : never,
  userinfo: UserSession,
) {
  try {
    const body = createSupplierBodySchema.parse(await readBody(event));
    const codes = await RbacRoleService.getUserPermissionCodes(
      String(userinfo.userId ?? userinfo.id ?? ''),
    );
    if (
      !codes.includes(PERMISSION_CODES.QMS.SUPPLIER.CREATE) &&
      String(body.category ?? '') !== 'Outsourcing'
    ) {
      return forbiddenResponse(event, '外协管理员只能创建外协单位');
    }
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
      detailsVariables: { name: supplier.name },
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
}

export default defineEventHandler((event) =>
  handleSupplierCreate(event as never, event.context.user),
);
