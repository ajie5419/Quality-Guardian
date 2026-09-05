import { REPORTS_PERMISSION_CODES } from '@qgs/shared';
import { defineEventHandler, getRequestHeader, getRequestIP } from 'h3';
import { authorizeWrite } from '~/modules/rbac';
import { ReportRouteService } from '~/modules/report/report-route.service';
import { logApiError } from '~/utils/api-logger';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';

export default defineEventHandler(async (event) => {
  const userinfo = await authorizeWrite(event, REPORTS_PERMISSION_CODES.DELETE);
  const id = getRequiredRouterParam(event, 'id', 'id required');
  if (typeof id !== 'string') {
    return id;
  }

  try {
    return useResponseSuccess(
      await ReportRouteService.deleteById(id, userinfo, {
        ipAddress: getRequestIP(event) ?? undefined,
        userAgent: getRequestHeader(event, 'user-agent') ?? undefined,
      }),
    );
  } catch (error: unknown) {
    logApiError('reports', error, undefined, event);
    return internalServerErrorResponse(event, 'Delete failed');
  }
});
