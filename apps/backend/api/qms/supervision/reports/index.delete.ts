import { defineEventHandler, getQuery } from 'h3';
import { SupervisionReportService } from '~/services/supervision-report.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  badRequestResponse,
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) return unAuthorizedResponse(event);

  const query = getQuery(event);
  const id = String(query.id || '').trim();
  if (!id) return badRequestResponse(event, '日报ID不能为空');

  try {
    await SupervisionReportService.deleteReport(id);
    return useResponseSuccess(null);
  } catch (error) {
    logApiError('supervision-report-delete', error);
    return internalServerErrorResponse(event, '删除日报失败');
  }
});
