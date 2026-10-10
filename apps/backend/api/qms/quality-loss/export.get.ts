import { PERMISSION_CODES } from '@qgs/shared';
import { defineEventHandler } from 'h3';
import upstreamHandler from '~/modules/quality-loss/quality-loss-export.get.service';
import { authorizeWrite } from '~/modules/rbac';
import { logApiError } from '~/utils/api-logger';
import { businessErrorResponse, isBusinessError } from '~/utils/business-error';
import { internalServerErrorResponse } from '~/utils/response';

export default defineEventHandler(async (event) => {
  try {
    await authorizeWrite(event, PERMISSION_CODES.QMS.LOSS_ANALYSIS.EXPORT);
    return await upstreamHandler(event);
  } catch (error) {
    logApiError('quality-loss-export-auth', error, undefined, event);
    if (isBusinessError(error)) return businessErrorResponse(event, error);
    return internalServerErrorResponse(event, '导出质量损失记录失败');
  }
});
