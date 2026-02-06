import { defineEventHandler, readBody } from 'h3';
import { SystemLogService } from '~/services/system-log.service';
import { useResponseError, useResponseSuccess } from '~/utils/response';

export default defineEventHandler(async (event) => {
  const { ids } = await readBody(event);

  if (!Array.isArray(ids) || ids.length === 0) {
    return useResponseError('BadRequestException', 'IDs array is required');
  }

  try {
    const result = await SystemLogService.batchDeleteLogs(ids);
    return useResponseSuccess({
      message: 'Logs deleted successfully',
      count: result.count,
    });
  } catch (error: any) {
    return useResponseError('InternalServerError', error.message);
  }
});
