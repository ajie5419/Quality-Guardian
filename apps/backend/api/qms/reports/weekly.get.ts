import { defineEventHandler, getQuery } from 'h3';
import { ReportService } from '~/services/report.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import { unAuthorizedResponse, useResponseSuccess } from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = await verifyAccessToken(event);
  if (!userinfo) return unAuthorizedResponse(event);

  const query = getQuery(event);
  const startDate = query.startDate as string;
  const endDate = query.endDate as string;

  if (!startDate || !endDate) {
    return useResponseSuccess({
      code: -1,
      message: 'Missing startDate or endDate parameters',
    });
  }

  try {
    const reportData = await ReportService.getWeeklyReport(startDate, endDate);
    return useResponseSuccess(reportData);
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    logApiError('weekly-report', error);
    return useResponseSuccess({
      code: -1,
      message: `Failed to generate weekly report: ${errorMessage}`,
    });
  }
});
