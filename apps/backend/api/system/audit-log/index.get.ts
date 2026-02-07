import { defineEventHandler, getQuery } from 'h3';
import { SystemLogService } from '~/services/system-log.service';
import { useResponseError, useResponseSuccess } from '~/utils/response';

export default defineEventHandler(async (event) => {
  const query = getQuery(event);

  try {
    const result = await SystemLogService.getAuditLogs({
      page: query.page ? Number(query.page) : 1,
      pageSize: query.pageSize ? Number(query.pageSize) : 20,
      userId: query.userId as string,
      action: query.action as string,
      targetType: query.targetType as string,
      startDate: query.startDate as string,
      endDate: query.endDate as string,
    });

    return useResponseSuccess(result);
  } catch (error: any) {
    return useResponseError('InternalServerError', error.message);
  }
});
