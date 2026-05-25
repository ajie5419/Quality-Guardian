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

const summaryQuerySchema = z.object({
  date: z.string().optional(),
  type: z.string().optional(),
});

export default defineEventHandler(async (event) => {
  const userinfo = await verifyAccessToken(event);
  if (!userinfo) return unAuthorizedResponse(event);
  const query = summaryQuerySchema.parse(getQuery(event));
  try {
    const data = await ReportSummaryService.getSummaryFromQuery(
      query.type,
      query.date,
    );
    return useResponseSuccess(data);
  } catch (error: unknown) {
    if (ReportSummaryService.isValidationError(error)) {
      return badRequestResponse(event, error.message);
    }
    logApiError('summary', error, undefined, event);
    return internalServerErrorResponse(event, '报告生成失败');
  }
});
