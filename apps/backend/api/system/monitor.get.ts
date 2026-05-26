import { defineEventHandler, setResponseStatus } from 'h3';
import { SystemService } from '~/modules/system/system.service';
import { logApiError } from '~/utils/api-logger';
import { getCurrentUser } from '~/utils/current-user';
import { useResponseError, useResponseSuccess } from '~/utils/response';
import { requireSystemAdmin } from '~/utils/system-auth';

export default defineEventHandler(async (event) => {
  const userinfo = getCurrentUser(event);

  const adminCheck = requireSystemAdmin(event, userinfo);
  if (adminCheck) {
    return adminCheck;
  }

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
    logApiError('system-monitor', error, undefined, event);
    setResponseStatus(event, 500);
    return useResponseError(
      `Failed to fetch system monitor data: ${(error as Error).message}`,
    );
  }
});
