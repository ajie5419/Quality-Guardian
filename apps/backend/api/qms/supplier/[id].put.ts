import { OUTSOURCING_PERMISSION_CODES, PERMISSION_CODES } from '@qgs/shared';
import { defineEventHandler } from 'h3';
import { authorizeWriteAnyOf, RbacRoleService } from '~/modules/rbac';
import upstreamHandler from '~/modules/supplier/supplier-id.put.service';
import { logApiError } from '~/utils/api-logger';
import { businessErrorResponse, isBusinessError } from '~/utils/business-error';
import { internalServerErrorResponse } from '~/utils/response';

export default defineEventHandler(async (event) => {
  try {
    const userinfo = await authorizeWriteAnyOf(event, [
      PERMISSION_CODES.QMS.SUPPLIER.EDIT,
      OUTSOURCING_PERMISSION_CODES.EDIT,
    ]);
    const codes = await RbacRoleService.getUserPermissionCodes(
      String(userinfo.userId ?? userinfo.id ?? ''),
    );
    if (!codes.includes(PERMISSION_CODES.QMS.SUPPLIER.EDIT)) {
      event.context.supplierWriteCategoryPolicy = 'Outsourcing';
    }
    return await upstreamHandler(event);
  } catch (error) {
    logApiError('supplier-put-auth', error, undefined, event);
    if (isBusinessError(error)) return businessErrorResponse(event, error);
    return internalServerErrorResponse(event, '修改供应商失败');
  }
});
