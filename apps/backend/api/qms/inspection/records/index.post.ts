import { defineEventHandler, readBody } from 'h3';
import { InspectionService } from '~/services/inspection.service';
import { logApiError } from '~/utils/api-logger';
import { recordBusinessAuditLog } from '~/utils/audit-log';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  badRequestResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  try {
    const userinfo = verifyAccessToken(event);
    const body = await readBody(event);
    const result = await InspectionService.create(body);
    await recordBusinessAuditLog(event, {
      userId: userinfo?.id,
      action: 'CREATE',
      targetType: 'inspection_record',
      targetId: String(result.id),
      details: `新增检验记录: ${result.projectName || result.workOrderNumber || result.id}`,
    });
    return useResponseSuccess(result);
  } catch (error: unknown) {
    logApiError('inspection-create', error);
    if (
      error instanceof Error &&
      String(error.message || '').startsWith('VALIDATION:')
    ) {
      return badRequestResponse(
        event,
        String(error.message || '').replace('VALIDATION:', ''),
      );
    }
    return internalServerErrorResponse(
      event,
      'Failed to create inspection record',
    );
  }
});
