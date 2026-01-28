import { defineEventHandler } from 'h3';
import { DashboardService } from '~/services/dashboard.service';
import { verifyAccessToken } from '~/utils/jwt-utils';
import { unAuthorizedResponse, useResponseSuccess } from '~/utils/response';

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
  } catch (error: any) {
    console.error('Dashboard logic failed:', error);
    return useResponseSuccess({
      overview: {
        fieldIssues: { open: 0, total: 0 },
        processIssues: { open: 0, total: 0 },
        qualityLoss: { weekly: 0, total: 0 },
        workOrders: { weekly: 0, total: 0 },
      },
      chartData: { monthlyQuality: [], issueDistribution: [] },
      recentWorkOrders: [],
    });
  }
});
