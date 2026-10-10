import { PERMISSION_CODES } from '@qgs/shared';
import { defineEventHandler } from 'h3';
import { authorizeWrite } from '~/modules/rbac';
import upstreamHandler from '~/modules/work-order/work-order-index.put.service';
import { logApiError } from '~/utils/api-logger';
import { businessErrorResponse, isBusinessError } from '~/utils/business-error';
import { internalServerErrorResponse } from '~/utils/response';

export default defineEventHandler(async (event) => {
  try {
    await authorizeWrite(event, PERMISSION_CODES.QMS.WORK_ORDER.EDIT);
    return await upstreamHandler(event);
  } catch (error) {
    logApiError('work-order-put-auth', error, undefined, event);
    if (isBusinessError(error)) return businessErrorResponse(event, error);
    return internalServerErrorResponse(event, '更新工单失败');
  }
});
