import { defineEventHandler, getQuery } from 'h3';
import { InspectionService } from '~/services/inspection.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import { unAuthorizedResponse, useResponseSuccess } from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  const query = getQuery(event);
  const year = query.year ? Number.parseInt(String(query.year)) : undefined;

  try {
    const result = await InspectionService.getIssueStats(year);
    return useResponseSuccess(result);
  } catch (error) {
    logApiError('stats', error);
    return useResponseSuccess({
      totalCount: 0,
      openCount: 0,
      closedCount: 0,
      totalLoss: 0,
      closedRate: 0,
      pieData: [],
      trendData: [],
    });
  }
});
