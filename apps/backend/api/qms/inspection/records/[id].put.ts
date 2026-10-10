import { INSPECTION_RECORD_PERMISSION_CODES } from '@qgs/shared';
import { defineEventHandler } from 'h3';
import inspectionRecordUpdateHandler from '~/modules/inspection/inspection-record-id.put.service';
import { authorizeWrite } from '~/modules/rbac';
import { logApiError } from '~/utils/api-logger';
import { businessErrorResponse, isBusinessError } from '~/utils/business-error';
import { internalServerErrorResponse } from '~/utils/response';

export default defineEventHandler(async (event) => {
  try {
    await authorizeWrite(event, INSPECTION_RECORD_PERMISSION_CODES.EDIT);
    return await inspectionRecordUpdateHandler(event);
  } catch (error) {
    // Authorization runs before the business handler and used to escape to the
    // Nitro error handler, turning a permission denial into HTTP 500.
    logApiError('inspection-record-update-auth', error, undefined, event);
    if (isBusinessError(error)) return businessErrorResponse(event, error);
    return internalServerErrorResponse(event, '更新检验记录失败');
  }
});
