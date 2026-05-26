import { defineEventHandler, getRouterParam } from 'h3';
import { VehicleCommissioningService } from '~/modules/vehicle-commissioning/vehicle-commissioning.service';
import { logApiError } from '~/utils/api-logger';
import {
  badRequestResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id');
  if (!id) {
    return badRequestResponse(event, '无效问题ID');
  }

  try {
    const data = await VehicleCommissioningService.getIssueLogs(id);
    return useResponseSuccess(data);
  } catch (error) {
    logApiError('vehicle-commissioning-issues-logs', error, undefined, event);
    return internalServerErrorResponse(event, 'Failed to fetch issue logs');
  }
});
