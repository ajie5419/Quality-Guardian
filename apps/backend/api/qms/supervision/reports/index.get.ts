import { defineEventHandler, getQuery } from 'h3';
import { SupervisionService } from '~/services/supervision.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) return unAuthorizedResponse(event);

  const query = getQuery(event) as Record<string, unknown>;
  try {
    const data = await SupervisionService.listReports({
      page: query.page ? Number(query.page) : undefined,
      pageSize: query.pageSize ? Number(query.pageSize) : undefined,
      projectId: query.projectId ? String(query.projectId) : undefined,
    });
    return useResponseSuccess(data);
  } catch (error) {
    logApiError('supervision-reports-list', error);
    return internalServerErrorResponse(
      event,
      'Failed to fetch supervision reports',
    );
  }
});
