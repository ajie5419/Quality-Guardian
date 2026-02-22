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

  const { ids } = await readBody(event);

  if (!Array.isArray(ids) || ids.length === 0) {
    setResponseStatus(event, 400);
    return useResponseError('IDs array is required');
  }

  try {
    const result = await SystemLogService.batchDeleteLogs(ids);
    return useResponseSuccess({
      message: 'Logs deleted successfully',
      count: result.count,
    });
  } catch (error: unknown) {
    logApiError('login-log', error);
    setResponseStatus(event, 500);
    return useResponseError('Failed to batch delete login logs');
  }
});
