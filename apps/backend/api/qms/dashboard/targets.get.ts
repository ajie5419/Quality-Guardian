import { defineEventHandler } from 'h3';
import { DashboardService } from '~/modules/dashboard/dashboard.service';
import { logApiError } from '~/utils/api-logger';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
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
