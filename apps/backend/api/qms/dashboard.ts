import { defineEventHandler } from 'h3';
import { DashboardService } from '~/services/dashboard.service';
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
    return internalServerErrorResponse(event, 'Failed to fetch dashboard data');
  }
});
