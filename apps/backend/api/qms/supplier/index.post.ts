import { OUTSOURCING_PERMISSION_CODES, PERMISSION_CODES } from '@qgs/shared';
import { defineEventHandler } from 'h3';
import { authorizeWriteAnyOf } from '~/modules/rbac';
import { handleSupplierCreate } from '~/modules/supplier/supplier-create.post.service';
import { logApiError } from '~/utils/api-logger';
import { businessErrorResponse, isBusinessError } from '~/utils/business-error';
import { internalServerErrorResponse } from '~/utils/response';

export default defineEventHandler(async (event) => {
  try {
    const userinfo = await authorizeWriteAnyOf(event, [
      PERMISSION_CODES.QMS.SUPPLIER.CREATE,
      OUTSOURCING_PERMISSION_CODES.CREATE,
    ]);
    return await handleSupplierCreate(event, userinfo);
  } catch (error) {
    logApiError('supplier-post-auth', error, undefined, event);
    if (isBusinessError(error)) return businessErrorResponse(event, error);
    return internalServerErrorResponse(event, '创建供应商失败');
  }
});
