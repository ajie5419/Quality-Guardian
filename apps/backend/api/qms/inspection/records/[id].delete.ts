import { defineEventHandler } from 'h3';
import { InspectionService } from '~/services/inspection.service';
import { logApiError } from '~/utils/api-logger';
import { recordBusinessAuditLog } from '~/utils/audit-log';
import { verifyAccessToken } from '~/utils/jwt-utils';
import { isPrismaNotFoundError } from '~/utils/prisma-error';
import {
  internalServerErrorResponse,
  notFoundResponse,
  useResponseSuccess,
} from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';

export default defineEventHandler(async (event) => {
  const id = getRequiredRouterParam(event, 'id', 'ID required');
  if (typeof id !== 'string') {
    return id;
  }

  try {
    const userinfo = verifyAccessToken(event);
    await InspectionService.delete(id);
    await recordBusinessAuditLog(event, {
      userId: userinfo?.id,
      action: 'DELETE',
      targetType: 'inspection_record',
      targetId: String(id),
      details: `删除检验记录: ${id}`,
    });
    return useResponseSuccess(null);
  } catch (error: unknown) {
    logApiError('inspection-delete', error);
    if (isPrismaNotFoundError(error)) {
      return notFoundResponse(event, 'Inspection record not found');
    }
    return internalServerErrorResponse(
      event,
      'Failed to delete inspection record',
    );
  }
});
