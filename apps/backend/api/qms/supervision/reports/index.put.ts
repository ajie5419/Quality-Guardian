import { defineEventHandler, getQuery, readBody } from 'h3';
import { SupervisionReportService } from '~/modules/supervision/supervision-report.service';
import { logApiError } from '~/utils/api-logger';
import {
  badRequestResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const id = String(query.id || '').trim();
  if (!id) return badRequestResponse(event, '日报ID不能为空');

  try {
    const body = await readBody(event);
    const data = await SupervisionReportService.updateReport(id, body);
    return useResponseSuccess(data);
  } catch (error) {
    logApiError('supervision-report-update', error, undefined, event);
    return internalServerErrorResponse(event, '更新日报失败');
  }
});
