import { REPORTS_PERMISSION_CODES } from '@qgs/shared';
import {
  defineEventHandler,
  getRequestHeader,
  getRequestIP,
  readBody,
} from 'h3';
import { z } from 'zod';
import { authorizeWrite } from '~/modules/rbac';
import { ReportRouteService } from '~/modules/report/report-route.service';
import { logApiError } from '~/utils/api-logger';
import {
  businessErrorResponse,
  legacyErrorToBusinessError,
} from '~/utils/business-error';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

const bodySchema = z
  .object({
    date: z.string().min(1),
    summary: z.string().optional(),
  })
  .passthrough();

export default defineEventHandler(async (event) => {
  const userinfo = await authorizeWrite(event, REPORTS_PERMISSION_CODES.EDIT);

  try {
    const body = bodySchema.parse(await readBody(event));
    return useResponseSuccess(
      await ReportRouteService.saveDailySummary({
        audit: {
          ipAddress: getRequestIP(event) ?? undefined,
          userAgent: getRequestHeader(event, 'user-agent') ?? undefined,
        },
        date: body.date,
        summary: String(body.summary || ''),
        userinfo,
      }),
    );
  } catch (error) {
    logApiError('daily-summary-save', error, undefined, event);
    const businessError = legacyErrorToBusinessError(error);
    if (businessError) return businessErrorResponse(event, businessError);
    return internalServerErrorResponse(event, '保存日报失败');
  }
});
