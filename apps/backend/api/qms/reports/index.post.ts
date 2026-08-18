import { REPORTS_PERMISSION_CODES } from '@qgs/shared';
import { defineEventHandler, readBody } from 'h3';
import { z } from 'zod';
import { authorizeWrite } from '~/modules/rbac';
import { ReportRouteService } from '~/modules/report/report-route.service';
import { logApiError } from '~/utils/api-logger';
import { getCurrentUser } from '~/utils/current-user';
import {
  badRequestResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

const bodySchema = z.object({ date: z.unknown() }).passthrough();

export default defineEventHandler(async (event) => {
  await authorizeWrite(event, REPORTS_PERMISSION_CODES.CREATE);
  const userinfo = getCurrentUser(event);

  try {
    const body = bodySchema.parse(await readBody(event));
    if (body.date === undefined || body.date === null || body.date === '') {
      return badRequestResponse(event, '缺少或无效字段: date');
    }
    return useResponseSuccess(
      await ReportRouteService.create({
        body,
        fallbackAuthor: userinfo.realName || userinfo.username || '',
      }),
    );
  } catch (error) {
    logApiError('reports', error, undefined, event);
    return internalServerErrorResponse(event, '创建报告失败');
  }
});
