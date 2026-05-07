import { defineEventHandler, readBody } from 'h3';
import { InspectionService } from '~/services/inspection.service';
import { logApiError } from '~/utils/api-logger';
import { recordBusinessAuditLog } from '~/utils/audit-log';
import { parseNonEmptyIdList } from '~/utils/id-list';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  badRequestResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  try {
    const userinfo = verifyAccessToken(event);
    const body = (await readBody(event)) as { ids?: unknown };
    const ids = parseNonEmptyIdList(body.ids);
    if (!ids) {
      return badRequestResponse(event, 'IDs required');
    }

    const result = await InspectionService.batchDelete(ids);
    await recordBusinessAuditLog(event, {
      userId: userinfo?.id,
      action: 'DELETE',
      targetType: 'inspection_record',
      targetId: ids.join(','),
      details: `批量删除检验记录: ${result.count} 条`,
    });
    return useResponseSuccess({ successCount: result.count });
  } catch (error: unknown) {
    logApiError('inspection-batch-delete', error);
    return internalServerErrorResponse(
      event,
      'Failed to batch delete inspection records',
    );
  }
});
