import { z } from 'zod';
import { WorkOrderRouteService } from '~/modules/work-order/work-order-route.service';
import { logApiError } from '~/utils/api-logger';
import {
  businessErrorResponse,
  legacyErrorToBusinessError,
} from '~/utils/business-error';
import { getCurrentUser } from '~/utils/current-user';
import { defineValidatedHandler } from '~/utils/define-validated-handler';
import { requireExpectedVersionBody } from '~/utils/optimistic-lock';
import { getRequiredQueryParam } from '~/utils/query-param';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

const bodySchema = z.object({}).passthrough();

export default defineValidatedHandler(bodySchema, async (event, body) => {
  const userinfo = getCurrentUser(event);

  const id = getRequiredQueryParam(event, 'id', '缺少工单号');
  if (typeof id !== 'string') return id;

  try {
    // OPTIMISTIC-LOCK-001: interactive work-order edits carry the version the
    // client read; a missing version would silently degrade to LWW.
    const expectedVersion = requireExpectedVersionBody(body);
    await WorkOrderRouteService.update(
      event,
      id,
      body,
      userinfo,
      expectedVersion,
    );
    return useResponseSuccess(null);
  } catch (error: unknown) {
    logApiError('work-order', error, undefined, event);
    const businessError = legacyErrorToBusinessError(error);
    if (businessError) {
      return businessErrorResponse(event, businessError);
    }
    const message = error instanceof Error ? error.message : 'Unknown error';
    return internalServerErrorResponse(event, `更新工单失败: ${message}`);
  }
});
