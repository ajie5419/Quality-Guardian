import { defineEventHandler, readBody } from 'h3';
import { InspectionService } from '~/modules/inspection/inspection.service';
import { recordBusinessAuditLog } from '~/modules/system-log/audit-log';
import { SystemService } from '~/modules/system/system.service';
import { logApiError } from '~/utils/api-logger';
import {
  BusinessError,
  businessErrorResponse,
  legacyErrorToBusinessError,
} from '~/utils/business-error';
import { getCurrentUser } from '~/utils/current-user';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  try {
    const userinfo = getCurrentUser(event);
    const body = await readBody(event);

    const isEnabled = await SystemService.isInspectionManualCreateEnabled();
    if (!isEnabled) {
      throw new BusinessError(
        'INSPECTION_MANUAL_CREATE_DISABLED',
        'Manual creation of inspection records is disabled',
        403,
      );
    }

    const result = await InspectionService.create(body);
    await recordBusinessAuditLog(event, {
      userId: userinfo?.id,
      action: 'CREATE',
      targetType: 'inspection_record',
      targetId: String(result.id),
      detailsTemplate: '新增检验记录: {{record}}',
      detailsVariables: {
        record: result.projectName || result.workOrderNumber || result.id,
      },
    });
    return useResponseSuccess(result);
  } catch (error: unknown) {
    logApiError('inspection-create', error, undefined, event);
    const businessError = legacyErrorToBusinessError(error);
    if (businessError) {
      return businessErrorResponse(event, businessError);
    }
    return internalServerErrorResponse(
      event,
      'Failed to create inspection record',
    );
  }
});
