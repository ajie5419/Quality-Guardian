import { INSPECTION_RECORD_PERMISSION_CODES } from '@qgs/shared';
import { defineEventHandler } from 'h3';
import upstreamHandler from '~/modules/inspection/inspection-record-export.get.service';
import { authorizeWrite } from '~/modules/rbac';
import { logApiError } from '~/utils/api-logger';
import { businessErrorResponse, isBusinessError } from '~/utils/business-error';
import { internalServerErrorResponse } from '~/utils/response';

export default defineEventHandler(async (event) => {
  try {
    await authorizeWrite(event, INSPECTION_RECORD_PERMISSION_CODES.EXPORT);
    return await upstreamHandler(event);
  } catch (error) {
    logApiError('inspection-record-export-auth', error, undefined, event);
    if (isBusinessError(error)) return businessErrorResponse(event, error);
    return internalServerErrorResponse(event, '导出检验记录失败');
  }
});
