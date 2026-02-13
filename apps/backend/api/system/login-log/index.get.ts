import { defineEventHandler, getQuery, setResponseStatus } from 'h3';
import { SystemLogService } from '~/services/system-log.service';
import { logApiError } from '~/utils/api-logger';
import { useResponseError, useResponseSuccess } from '~/utils/response';

export default defineEventHandler(async (event) => {
  const query = getQuery(event);

  try {
    const result = await SystemLogService.getLoginLogs({
      page: query.page ? Number(query.page) : 1,
      pageSize: query.pageSize ? Number(query.pageSize) : 20,
      username: query.username as string,
      status: query.status as string,
      startDate: query.startDate as string,
      endDate: query.endDate as string,
    });

    return useResponseSuccess(result);
  } catch (error: unknown) {
    logApiError('login-log', error);
    setResponseStatus(event, 500);
    return useResponseError('Failed to fetch login logs');
  }
});
