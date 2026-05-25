import { defineEventHandler, readBody } from 'h3';
import { z } from 'zod';
import { ReportRouteService } from '~/modules/report/report-route.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  badRequestResponse,
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';

const bodySchema = z
  .object({
    date: z.string().min(1),
    summary: z.string().optional(),
    user: z.string().optional(),
  })
  .passthrough();

export default defineEventHandler(async (event) => {
  const userinfo = await verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  try {
    const body = bodySchema.parse(await readBody(event));
    const reporter = String(body.user || userinfo.username || '').trim();
    if (!reporter) {
      return badRequestResponse(event, '缺少或无效字段: user');
    }
    return useResponseSuccess(
      await ReportRouteService.saveDailySummary({
        date: body.date,
        reporter,
        summary: String(body.summary || ''),
      }),
    );
  } catch (error) {
    logApiError('daily-summary-save', error, undefined, event);
    return internalServerErrorResponse(event, '保存日报失败');
  }
});
