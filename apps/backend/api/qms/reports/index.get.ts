import { defineEventHandler } from 'h3';
import { ReportRouteService } from '~/modules/report/report-route.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  internalServerErrorResponse,
  unAuthorizedResponse,
  useListResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = await verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  try {
    return useListResponseSuccess(await ReportRouteService.getList());
  } catch (error) {
    logApiError('reports', error, undefined, event);
    return internalServerErrorResponse(event, 'Failed to fetch reports');
  }
});
