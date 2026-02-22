import { defineEventHandler, readBody, setResponseStatus } from 'h3';
import { SystemLogService } from '~/services/system-log.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  unAuthorizedResponse,
  useResponseError,
  useResponseSuccess,
} from '~/utils/response';
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

  const body = await readBody(event);
  const { ids } = body;

  if (!Array.isArray(ids) || ids.length === 0) {
    setResponseStatus(event, 400);
    return useResponseError('Invalid IDs');
  }

  try {
    const result = await SystemLogService.batchDeleteAuditLogs(ids);
    return useResponseSuccess({ successCount: result.count });
  } catch (error: unknown) {
    logApiError('audit-log', error);
    setResponseStatus(event, 500);
    return useResponseError('Failed to batch delete audit logs');
  }
});
