import { defineEventHandler, setResponseStatus } from 'h3';
import { SystemLogService } from '~/services/system-log.service';
import { logApiError } from '~/utils/api-logger';
import { isPrismaNotFoundError } from '~/utils/prisma-error';
import { useResponseError, useResponseSuccess } from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';

export default defineEventHandler(async (event) => {
  const id = getRequiredRouterParam(event, 'id', 'Log ID is required');
  if (typeof id !== 'string') {
    return id;
  }

  try {
    await SystemLogService.deleteLog(id);
    return useResponseSuccess({ message: 'Log deleted successfully' });
  } catch (error: unknown) {
    logApiError('login-log', error);
    setResponseStatus(event, isPrismaNotFoundError(error) ? 404 : 500);
    return useResponseError(
      isPrismaNotFoundError(error)
        ? 'Login log not found'
        : 'Failed to delete login log',
    );
  }
});
