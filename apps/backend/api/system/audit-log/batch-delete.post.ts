import { defineEventHandler, readBody } from 'h3';
import { SystemLogService } from '~/services/system-log.service';
import { useResponseError, useResponseSuccess } from '~/utils/response';

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { ids } = body;

  if (!ids || !Array.isArray(ids)) {
    return useResponseError('InvalidIds');
  }

  try {
    const result = await SystemLogService.batchDeleteAuditLogs(ids);
    return useResponseSuccess({ successCount: result.count });
  } catch (error: any) {
    return useResponseError('InternalServerError', error.message);
  }
});
