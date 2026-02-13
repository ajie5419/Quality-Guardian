import { defineEventHandler, setResponseStatus } from 'h3';
import { DashboardService } from '~/services/dashboard.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  unAuthorizedResponse,
  useResponseError,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  try {
    const [stats, monthlyQuality, issueDistribution] = await Promise.all([
      DashboardService.getStats(),
      DashboardService.getMonthlyTrend(),
      DashboardService.getIssueDistribution(),
    ]);

    return useResponseSuccess({
      overview: stats.overview,
      chartData: { monthlyQuality, issueDistribution },
      recentWorkOrders: stats.recentWorkOrders.map((wo) => ({
        id: wo.workOrderNumber,
        title: wo.projectName || wo.customerName,
        status: wo.status,
        priority: 'Medium',
      })),
    });
  } catch (error) {
    logApiError('dashboard', error);
    setResponseStatus(event, 500);
    return useResponseError('Failed to fetch dashboard data');
  }
});
