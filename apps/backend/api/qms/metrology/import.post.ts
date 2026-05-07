import { defineEventHandler, readBody } from 'h3';
import { MetrologyService } from '~/services/metrology.service';
import { logApiError } from '~/utils/api-logger';
import { recordBusinessAuditLog } from '~/utils/audit-log';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  badRequestResponse,
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = await verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  try {
    const body = await readBody<{ fileName?: string; items?: unknown[] }>(
      event,
    );
    if (!Array.isArray(body?.items) || body.items.length === 0) {
      return badRequestResponse(event, 'No metrology data to import');
    }

    const result = await MetrologyService.importItems(
      body.items,
      String(userinfo.username || userinfo.realName || ''),
      String(body.fileName || '').trim() || undefined,
    );
    await recordBusinessAuditLog(event, {
      userId: userinfo.id,
      action: 'CREATE',
      targetType: 'metrology',
      targetId: 'batch-import',
      details: `导入计量器具: ${result.successCount}/${body.items.length} 条`,
    });
    return useResponseSuccess(result);
  } catch (error) {
    logApiError('metrology-import', error);
    return internalServerErrorResponse(
      event,
      'Failed to import metrology data',
    );
  }
});
