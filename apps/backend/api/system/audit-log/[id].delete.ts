import { defineEventHandler, getRouterParam } from 'h3';
import { SystemLogService } from '~/services/system-log.service';
import { useResponseError, useResponseSuccess } from '~/utils/response';

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id');
  if (!id) {
    return useResponseError('MissingId');
  }

  try {
    await SystemLogService.deleteAuditLog(id);
    return useResponseSuccess(null);
  } catch (error: any) {
    return useResponseError('InternalServerError', error.message);
  }
});
