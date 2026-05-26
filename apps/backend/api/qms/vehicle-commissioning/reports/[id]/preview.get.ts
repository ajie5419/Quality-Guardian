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
    return badRequestResponse(event, '无效日报ID');
  }

  try {
    const data = await VehicleCommissioningService.getDailyReportPreview(id);
    if (!data) {
      return badRequestResponse(event, '日报不存在');
    }
    return useResponseSuccess(data);
  } catch (error) {
    logApiError(
      'vehicle-commissioning-reports-preview',
      error,
      undefined,
      event,
    );
    return internalServerErrorResponse(event, 'Failed to preview daily report');
  }
});
