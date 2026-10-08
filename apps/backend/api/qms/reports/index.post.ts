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
  badRequestResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

const bodySchema = z.object({ date: z.unknown() }).passthrough();

export default defineEventHandler(async (event) => {
  const userinfo = await authorizeWrite(event, REPORTS_PERMISSION_CODES.CREATE);

  try {
    const body = bodySchema.parse(await readBody(event));
    if (body.date === undefined || body.date === null || body.date === '') {
      return badRequestResponse(event, '缺少或无效字段: date');
    }
    return useResponseSuccess(
      await ReportRouteService.create({
        audit: {
          ipAddress: getRequestIP(event) ?? undefined,
          userAgent: getRequestHeader(event, 'user-agent') ?? undefined,
        },
        body,
        userinfo,
      }),
    );
  } catch (error) {
    logApiError('reports', error, undefined, event);
    const businessError = legacyErrorToBusinessError(error);
    if (businessError) return businessErrorResponse(event, businessError);
    return internalServerErrorResponse(event, '创建报告失败');
  }
});
