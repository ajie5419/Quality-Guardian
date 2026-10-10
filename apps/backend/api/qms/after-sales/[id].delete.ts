import { PERMISSION_CODES } from '@qgs/shared';
import { defineEventHandler } from 'h3';
import upstreamHandler from '~/modules/after-sales/after-sales-id.delete.service';
import { authorizeWrite } from '~/modules/rbac';
import { logApiError } from '~/utils/api-logger';
import { BusinessError, businessErrorResponse } from '~/utils/business-error';
import { internalServerErrorResponse } from '~/utils/response';

export default defineEventHandler(async (event) => {
  try {
    await authorizeWrite(event, PERMISSION_CODES.QMS.AFTER_SALES.DELETE);
    return await upstreamHandler(event);
  } catch (error) {
    logApiError('after-sales', error, undefined, event);
    if (error instanceof BusinessError) {
      return businessErrorResponse(event, error);
    }
    return internalServerErrorResponse(event, '删除售后记录失败');
  }
});
