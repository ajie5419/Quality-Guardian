import { defineEventHandler, getQuery } from 'h3';
import { InspectionService } from '~/services/inspection.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  try {
    const query = getQuery(event);
    const date = String(query.date || '').trim() || undefined;
    const status = String(query.status || '').trim() || undefined;
    const page = Number(query.page || 1);
    const pageSize = Number(query.pageSize || 20);
    const inspector = String(query.inspector || userinfo.username || '').trim();

    const result = await InspectionService.getArchiveTasks({
      date,
      inspector,
      page,
      pageSize,
      status: status as any,
    });
    return useResponseSuccess(result);
  } catch (error) {
    logApiError('inspection-archive-tasks', error);
    return internalServerErrorResponse(event, 'Failed to fetch archive tasks');
  }
});
