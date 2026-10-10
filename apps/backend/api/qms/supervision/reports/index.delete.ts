import { SUPERVISION_PERMISSION_CODES } from '@qgs/shared';
import { defineEventHandler, getQuery } from 'h3';
import { authorizeWrite } from '~/modules/rbac';
import { buildSupervisionAccessContext } from '~/modules/supervision/supervision-access';
import { SupervisionReportService } from '~/modules/supervision/supervision-report.service';
import { logApiError } from '~/utils/api-logger';
import { businessErrorResponse, isBusinessError } from '~/utils/business-error';
import {
  badRequestResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  try {
    const userinfo = await authorizeWrite(
      event,
      SUPERVISION_PERMISSION_CODES.DELETE,
    );
    const context = buildSupervisionAccessContext(userinfo);
    const query = getQuery(event);
    const id = String(query.id || '').trim();
    if (!id) return badRequestResponse(event, '日报ID不能为空');

    await SupervisionReportService.deleteReport(id, context);
    return useResponseSuccess(null);
  } catch (error) {
    logApiError('supervision-report-delete', error, undefined, event);
    if (isBusinessError(error)) return businessErrorResponse(event, error);
    return internalServerErrorResponse(event, '删除日报失败');
  }
});
