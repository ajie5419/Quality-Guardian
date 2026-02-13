import { defineEventHandler, getRouterParam, setResponseStatus } from 'h3';
import { SystemLogService } from '~/services/system-log.service';
import { logApiError } from '~/utils/api-logger';
import { isPrismaNotFoundError } from '~/utils/prisma-error';
import { useResponseError, useResponseSuccess } from '~/utils/response';

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id');
  if (!id) {
    setResponseStatus(event, 400);
    return useResponseError('Missing ID');
  }

  try {
    await SystemLogService.deleteAuditLog(id);
    return useResponseSuccess(null);
  } catch (error: unknown) {
    logApiError('audit-log', error);
    setResponseStatus(event, isPrismaNotFoundError(error) ? 404 : 500);
    return useResponseError(
      isPrismaNotFoundError(error)
        ? 'Audit log not found'
        : 'Failed to delete audit log',
    );
  }
});
