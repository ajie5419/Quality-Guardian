import { defineEventHandler, readBody } from 'h3';
import { z } from 'zod';
import { InspectionService } from '~/modules/inspection/inspection.service';
import { logApiError } from '~/utils/api-logger';
import { recordBusinessAuditLog } from '~/utils/audit-log';
import {
  businessErrorResponse,
  legacyErrorToBusinessError,
} from '~/utils/business-error';
import { getCurrentUser } from '~/utils/current-user';
import { isPrismaNotFoundError } from '~/utils/db-error';
import {
  internalServerErrorResponse,
  notFoundResponse,
  useResponseSuccess,
} from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';

const schema = z.object({}).passthrough();

export default defineEventHandler(async (event) => {
  const id = getRequiredRouterParam(event, 'id', 'ID required');
  if (typeof id !== 'string') return id;

  try {
    const userinfo = getCurrentUser(event);
    const body = schema.parse(await readBody(event));
    const result = await InspectionService.update(
      id,
      body as unknown as Parameters<typeof InspectionService.update>[1],
    );
    await recordBusinessAuditLog(event, {
      userId: userinfo?.id,
      action: 'UPDATE',
      targetType: 'inspection_record',
      targetId: String(id),
      detailsTemplate: '修改检验记录: {{record}}',
      detailsVariables: {
        record: result.projectName || result.workOrderNumber || id,
      },
    });
    return useResponseSuccess(result);
  } catch (error: unknown) {
    logApiError('inspection-update', error, undefined, event);
    const businessError = legacyErrorToBusinessError(error);
    if (businessError) {
      return businessErrorResponse(event, businessError);
    }
    if (isPrismaNotFoundError(error))
      return notFoundResponse(event, 'Inspection record not found');
    return internalServerErrorResponse(
      event,
      'Failed to update inspection record',
    );
  }
});
