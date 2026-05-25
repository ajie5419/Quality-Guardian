import { defineEventHandler } from 'h3';
import { DashboardRouteService } from '~/modules/dashboard/dashboard-route.service';
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
    return useResponseSuccess(
      await DashboardRouteService.getWorkspaceSummary(),
    );
  } catch (error) {
    logApiError('workspace', error, undefined, event);
    return internalServerErrorResponse(event, 'Failed to fetch workspace data');
  }
});
