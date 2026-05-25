import { defineEventHandler } from 'h3';
import { MetrologyService } from '~/modules/metrology/metrology.service';
import { logApiError } from '~/utils/api-logger';
import { recordBusinessAuditLog } from '~/utils/audit-log';
import { verifyAccessToken } from '~/utils/jwt-utils';
import { isPrismaNotFoundError } from '~/utils/prisma-error';
import {
  internalServerErrorResponse,
  notFoundResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  const id = getRequiredRouterParam(event, 'id', '缺少计量器具ID');
  if (typeof id !== 'string') {
    return id;
  }

  try {
    const deleted = await MetrologyService.deleteById(id, userinfo.username);

    await recordBusinessAuditLog(event, {
      userId: userinfo.id,
      action: 'DELETE',
      targetType: 'metrology',
      targetId: String(id),
      detailsTemplate: '删除计量器具: {{instrumentName}} ({{instrumentCode}})',
      detailsVariables: {
        instrumentCode: deleted.instrumentCode,
        instrumentName: deleted.instrumentName,
      },
    });

    return useResponseSuccess(null);
  } catch (error: unknown) {
    logApiError('metrology-delete', error, undefined, event);
    if (isPrismaNotFoundError(error)) {
      return notFoundResponse(event, '计量器具不存在');
    }
    return internalServerErrorResponse(event, '删除计量器具失败');
  }
});
