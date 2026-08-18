import { PERMISSION_CODES } from '@qgs/shared';
import { defineEventHandler } from 'h3';
import { QualityLossService } from '~/modules/quality-loss/quality-loss.service';
import { authorizeWrite } from '~/modules/rbac';
import { logApiError } from '~/utils/api-logger';
import { businessErrorResponse, isBusinessError } from '~/utils/business-error';
import { getCurrentUser } from '~/utils/current-user';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';

export default defineEventHandler(async (event) => {
  await authorizeWrite(event, PERMISSION_CODES.QMS.LOSS_ANALYSIS.DELETE);
  const userinfo = getCurrentUser(event);

  const id = getRequiredRouterParam(event, 'id', 'Missing ID');
  if (typeof id !== 'string') {
    return id;
  }

  try {
    await QualityLossService.deleteRecord(id, {
      dataScope: event.context.dataScope,
      userId: String(userinfo.id),
    });
    return useResponseSuccess(null);
  } catch (error: unknown) {
    logApiError('quality-loss', error, undefined, event);
    if (isBusinessError(error)) return businessErrorResponse(event, error);
    return internalServerErrorResponse(event, '删除质量损失记录失败');
  }
});
