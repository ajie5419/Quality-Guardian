import { defineEventHandler } from 'h3';
import { SystemLogService } from '~/services/system-log.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import { isPrismaNotFoundError } from '~/utils/prisma-error';
import {
  internalServerErrorResponse,
  notFoundResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';
import { requireSystemAdmin } from '~/utils/system-auth';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }
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
    logApiError('login-log', error);
    if (isPrismaNotFoundError(error)) {
      return notFoundResponse(event, 'Login log not found');
    }
    return internalServerErrorResponse(event, 'Failed to delete login log');
  }
});
