import { defineEventHandler } from 'h3';
import { VehicleCommissioningService } from '~/modules/vehicle-commissioning';
import { logApiError } from '~/utils/api-logger';
import { businessErrorResponse, isBusinessError } from '~/utils/business-error';
import { getCurrentUser } from '~/utils/current-user';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';

export default defineEventHandler(async (event) => {
  const userinfo = getCurrentUser(event);
  const id = getRequiredRouterParam(event, 'id', '缺少问题ID');
  if (typeof id !== 'string') return id;

  try {
    await VehicleCommissioningService.deleteIssue(id, userinfo);
    return useResponseSuccess(null);
  } catch (error: unknown) {
    logApiError('vehicle-commissioning-issues-delete', error, undefined, event);
    if (isBusinessError(error)) return businessErrorResponse(event, error);
    return internalServerErrorResponse(event, '删除调试验收问题失败');
  }
});
