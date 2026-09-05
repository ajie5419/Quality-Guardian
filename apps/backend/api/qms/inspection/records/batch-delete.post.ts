import { INSPECTION_RECORD_PERMISSION_CODES } from '@qgs/shared';
import { defineEventHandler, readBody } from 'h3';
import { InspectionService } from '~/modules/inspection/inspection.service';
import { authorizeWrite } from '~/modules/rbac';
import { recordBusinessAuditLog } from '~/modules/system-log/audit-log';
import { logApiError } from '~/utils/api-logger';
import { businessErrorResponse, isBusinessError } from '~/utils/business-error';
import { parseNonEmptyIdList } from '~/utils/id-list';
import {
  badRequestResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  try {
    const userinfo = await authorizeWrite(
      event,
      INSPECTION_RECORD_PERMISSION_CODES.DELETE,
    );
    const body = (await readBody(event)) as { ids?: unknown };
    const ids = parseNonEmptyIdList(body.ids);
    if (!ids) {
      return badRequestResponse(event, 'IDs required');
    }

    const result = await InspectionService.batchDelete(ids, {
      scope: event.context.dataScope,
      user: userinfo,
    });
    await recordBusinessAuditLog(event, {
      userId: userinfo?.id,
      action: 'DELETE',
      targetType: 'inspection_record',
      targetId: ids.join(','),
      detailsTemplate: '批量删除检验记录: {{count}} 条',
      detailsVariables: {
        count: result.count,
      },
    });
    return useResponseSuccess({ successCount: result.count });
  } catch (error: unknown) {
    logApiError('inspection-batch-delete', error, undefined, event);
    if (isBusinessError(error)) return businessErrorResponse(event, error);
    return internalServerErrorResponse(
      event,
      'Failed to batch delete inspection records',
    );
  }
});
