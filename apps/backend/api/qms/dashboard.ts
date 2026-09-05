import { defineEventHandler } from 'h3';
import { DashboardService } from '~/modules/dashboard/dashboard.service';
import { logApiError } from '~/utils/api-logger';
import { getAnalyticsAccessContext } from '~/utils/current-user';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  try {
    const access = getAnalyticsAccessContext(event);
    const [stats, monthlyQuality, issueDistribution] = await Promise.all([
      DashboardService.getStats(access),
      DashboardService.getMonthlyTrend(access),
      DashboardService.getIssueDistribution(access),
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
    logApiError('dashboard', error, undefined, event);
    return internalServerErrorResponse(event, 'Failed to fetch dashboard data');
  }
});
