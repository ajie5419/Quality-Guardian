import { defineEventHandler } from 'h3';
import { DashboardService } from '~/modules/dashboard/dashboard.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = await verifyAccessToken(event);
  if (!userinfo) return unAuthorizedResponse(event);

  try {
    return useResponseSuccess(await DashboardService.getPassRateTargets());
  } catch (error) {
    logApiError('dashboard-targets', error, undefined, event);
    return internalServerErrorResponse(
      event,
      `Failed to fetch quality targets: ${(error as Error).message}`,
    );
  }
});
