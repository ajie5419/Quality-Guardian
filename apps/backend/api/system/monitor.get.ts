import { defineEventHandler, setResponseStatus } from 'h3';
import { SystemService } from '~/services/system.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  unAuthorizedResponse,
  useResponseError,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = await verifyAccessToken(event);
  if (!userinfo) return unAuthorizedResponse(event);

  // Consider adding admin role check here if needed
  // if (userinfo.role !== 'admin') return unAuthorizedResponse(event);

  try {
    const [server, database] = await Promise.all([
      SystemService.getServerMetrics(),
      SystemService.getDatabaseMetrics(),
    ]);

    return useResponseSuccess({
      server,
      database,
      timestamp: new Date()
        .toLocaleString('zh-CN', { hour12: false })
        .replaceAll('/', '-'),
    });
  } catch (error) {
    logApiError('system-monitor', error);
    setResponseStatus(event, 500);
    return useResponseError(
      `Failed to fetch system monitor data: ${(error as Error).message}`,
    );
  }
});
