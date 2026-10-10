import { PERMISSION_CODES } from '@qgs/shared';
import { defineEventHandler } from 'h3';
import upstreamHandler from '~/modules/quality-loss/quality-loss-create.post.service';
import { authorizeWrite } from '~/modules/rbac';
import { logApiError } from '~/utils/api-logger';
import { businessErrorResponse, isBusinessError } from '~/utils/business-error';
import { internalServerErrorResponse } from '~/utils/response';

export default defineEventHandler(async (event) => {
  try {
    await authorizeWrite(event, PERMISSION_CODES.QMS.LOSS_ANALYSIS.CREATE);
    return await upstreamHandler(event);
  } catch (error) {
    logApiError('quality-loss-post-auth', error, undefined, event);
    if (isBusinessError(error)) return businessErrorResponse(event, error);
    return internalServerErrorResponse(event, '创建质量损失记录失败');
  }
});
