import { defineEventHandler } from 'h3';
import { SystemLogService } from '~/modules/system-log/system-log.service';
import { requireSystemAdmin } from '~/modules/user/system-auth';
import { logApiError } from '~/utils/api-logger';
import { getCurrentUser } from '~/utils/current-user';
import { isPrismaNotFoundError } from '~/utils/db-error';
import {
  internalServerErrorResponse,
  notFoundResponse,
  useResponseSuccess,
} from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';

export default defineEventHandler(async (event) => {
  const userinfo = getCurrentUser(event);
  const adminCheck = requireSystemAdmin(event, userinfo);
  if (adminCheck) {
    return adminCheck;
  }

  const id = getRequiredRouterParam(event, 'id', 'Log ID is required');
  if (typeof id !== 'string') {
    return id;
  }

  try {
    await SystemLogService.deleteLog(id);
    return useResponseSuccess({ message: 'Log deleted successfully' });
  } catch (error: unknown) {
    logApiError('login-log', error, undefined, event);
    if (isPrismaNotFoundError(error)) {
      return notFoundResponse(event, 'Login log not found');
    }
    return internalServerErrorResponse(event, 'Failed to delete login log');
  }
});
