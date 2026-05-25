import { defineEventHandler, getQuery } from 'h3';
import { z } from 'zod';
import { ReportSummaryService } from '~/modules/report/report-summary.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  badRequestResponse,
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';

const dailySummaryQuerySchema = z.object({
  date: z.string().optional(),
  user: z.string().optional(),
});

export default defineEventHandler(async (event) => {
  const userinfo = await verifyAccessToken(event);
  if (!userinfo) return unAuthorizedResponse(event);
  const query = dailySummaryQuerySchema.parse(getQuery(event));
  try {
    const data = await ReportSummaryService.getDailySummaryFromQuery({
      date: query.date,
      realName: userinfo.realName,
      user: query.user,
      username: userinfo.username,
    });
    return useResponseSuccess(data);
  } catch (error: unknown) {
    if (ReportSummaryService.isValidationError(error)) {
      return badRequestResponse(event, error.message);
    }
    logApiError('daily-summary', error, undefined, event);
    return internalServerErrorResponse(event, 'Failed to fetch daily summary');
  }
});
