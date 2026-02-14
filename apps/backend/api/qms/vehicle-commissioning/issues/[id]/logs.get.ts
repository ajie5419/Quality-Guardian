import { defineEventHandler, getRouterParam } from 'h3';
import { VehicleCommissioningService } from '~/services/vehicle-commissioning.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  badRequestResponse,
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  const id = getRouterParam(event, 'id');
  if (!id) {
    return badRequestResponse(event, '无效问题ID');
  }

  try {
    const data = await VehicleCommissioningService.getIssueLogs(id);
    return useResponseSuccess(data);
  } catch (error) {
    logApiError('vehicle-commissioning-issues-logs', error);
    return internalServerErrorResponse(event, 'Failed to fetch issue logs');
  }
});
