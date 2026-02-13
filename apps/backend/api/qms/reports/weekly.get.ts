import { defineEventHandler, getQuery, setResponseStatus } from 'h3';
import { ReportService } from '~/services/report.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import { resolveReportDateRangeQuery } from '~/utils/report';
import {
  badRequestResponse,
  unAuthorizedResponse,
  useResponseError,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = await verifyAccessToken(event);
  if (!userinfo) return unAuthorizedResponse(event);

  const query = getQuery(event);
  const dateRange = resolveReportDateRangeQuery(query.startDate, query.endDate);

  if (dateRange.reason === 'MISSING') {
    return badRequestResponse(event, 'Missing startDate or endDate parameters');
  }
  if (dateRange.reason === 'INVALID') {
    return badRequestResponse(event, 'Invalid startDate or endDate parameters');
  }

  try {
    const reportData = await ReportService.getWeeklyReport(
      dateRange.startDate,
      dateRange.endDate,
      {
        name: userinfo.realName || userinfo.username,
        dept: userinfo.deptName || '-',
        role: userinfo.roles?.[0] || '-',
        leader: '-',
      },
    );
    return useResponseSuccess(reportData);
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    logApiError('weekly-report', error);
    setResponseStatus(event, 500);
    return useResponseError(
      `Failed to generate weekly report: ${errorMessage}`,
    );
  }
});
