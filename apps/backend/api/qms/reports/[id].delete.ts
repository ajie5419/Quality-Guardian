import { defineEventHandler } from 'h3';
import { ReportRouteService } from '~/modules/report/report-route.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';

export default defineEventHandler(async (event) => {
  const userinfo = await verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  const id = getRequiredRouterParam(event, 'id', 'id required');
  if (typeof id !== 'string') {
    return id;
  }

  try {
    return useResponseSuccess(await ReportRouteService.deleteById(id));
  } catch (error: unknown) {
    logApiError('reports', error, undefined, event);
    return internalServerErrorResponse(event, 'Delete failed');
  }
});
