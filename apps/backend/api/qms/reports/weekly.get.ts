import { defineEventHandler, getQuery, setResponseStatus } from 'h3';
import { ReportService } from '~/services/report.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import { parseReportDate } from '~/utils/report';
import {
  unAuthorizedResponse,
  useResponseError,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = await verifyAccessToken(event);
  if (!userinfo) return unAuthorizedResponse(event);

  const query = getQuery(event);
  const startDate = query.startDate as string;
  const endDate = query.endDate as string;

  if (!startDate || !endDate) {
    setResponseStatus(event, 400);
    return useResponseError('Missing startDate or endDate parameters');
  }
  if (!parseReportDate(startDate) || !parseReportDate(endDate)) {
    setResponseStatus(event, 400);
    return useResponseError('Invalid startDate or endDate parameters');
  }

  try {
    const reportData = await ReportService.getWeeklyReport(startDate, endDate, {
      name: userinfo.realName || userinfo.username,
      dept: userinfo.deptName || '-',
      role: userinfo.roles?.[0] || '-',
      leader: '-',
    });
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
