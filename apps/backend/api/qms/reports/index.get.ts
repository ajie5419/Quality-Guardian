import { defineEventHandler } from 'h3';
import { ReportRouteService } from '~/modules/report/report-route.service';
import { logApiError } from '~/utils/api-logger';
import { getCurrentUser } from '~/utils/current-user';
import {
  internalServerErrorResponse,
  useListResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  try {
    return useListResponseSuccess(
      await ReportRouteService.getList(getCurrentUser(event)),
    );
  } catch (error) {
    logApiError('reports', error, undefined, event);
    return internalServerErrorResponse(event, 'Failed to fetch reports');
  }
});
