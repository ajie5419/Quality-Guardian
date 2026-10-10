import { METROLOGY_PERMISSION_CODES } from '@qgs/shared';
import { defineEventHandler } from 'h3';
import upstreamHandler from '~/modules/metrology/calibration-plan-create.post.service';
import { authorizeWrite } from '~/modules/rbac';
import { logApiError } from '~/utils/api-logger';
import { BusinessError, businessErrorResponse } from '~/utils/business-error';
import { internalServerErrorResponse } from '~/utils/response';

export default defineEventHandler(async (event) => {
  try {
    await authorizeWrite(
      event,
      METROLOGY_PERMISSION_CODES.CALIBRATION_PLAN_CREATE,
    );
    return await upstreamHandler(event);
  } catch (error) {
    logApiError('metrology-write', error, undefined, event);
    if (error instanceof BusinessError)
      return businessErrorResponse(event, error);
    return internalServerErrorResponse(event, '计量数据写入失败');
  }
});
