import { defineEventHandler } from 'h3';
import { SystemLogService } from '~/modules/system-log/system-log.service';
import { logApiError } from '~/utils/api-logger';
import { getCurrentUser } from '~/utils/current-user';
import { isPrismaNotFoundError } from '~/utils/db-error';
import {
  internalServerErrorResponse,
  notFoundResponse,
  useResponseSuccess,
} from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';
import { requireSystemAdmin } from '~/utils/system-auth';

export default defineEventHandler(async (event) => {
  const userinfo = getCurrentUser(event);
  const adminCheck = requireSystemAdmin(event, userinfo);
  if (adminCheck) {
    return adminCheck;
  }

  const id = getRequiredRouterParam(event, 'id', 'Missing ID');
  if (typeof id !== 'string') {
    return id;
  }

  try {
    await SystemLogService.deleteAuditLog(id);
    return useResponseSuccess(null);
  } catch (error: unknown) {
    logApiError('audit-log', error, undefined, event);
    if (isPrismaNotFoundError(error)) {
      return notFoundResponse(event, 'Audit log not found');
    }
    return internalServerErrorResponse(event, 'Failed to delete audit log');
  }
});
