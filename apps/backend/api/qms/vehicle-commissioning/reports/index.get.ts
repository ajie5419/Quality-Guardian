import { defineEventHandler, getQuery } from 'h3';
import { VehicleCommissioningService } from '~/services/vehicle-commissioning.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  const query = getQuery(event) as Record<string, unknown>;
  try {
    const data = await VehicleCommissioningService.getDailyReports({
      page: query.page ? Number(query.page) : undefined,
      pageSize: query.pageSize ? Number(query.pageSize) : undefined,
      projectName: query.projectName ? String(query.projectName) : undefined,
    });
    return useResponseSuccess(data);
  } catch (error) {
    logApiError('vehicle-commissioning-reports-list', error);
    return internalServerErrorResponse(event, 'Failed to fetch daily reports');
  }
});
