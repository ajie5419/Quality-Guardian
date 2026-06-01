import { defineEventHandler, readBody } from 'h3';
import { z } from 'zod';
import { InspectionRequestDispatchService } from '~/modules/inspection/inspection-request-dispatch.service';
import { logApiError } from '~/utils/api-logger';
import {
  businessErrorResponse,
  legacyErrorToBusinessError,
} from '~/utils/business-error';
import { getCurrentUser } from '~/utils/current-user';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';

const schema = z.object({}).passthrough();

export default defineEventHandler(async (event) => {
  const userinfo = getCurrentUser(event);

  const id = getRequiredRouterParam(event, 'id', 'ID required');
  if (typeof id !== 'string') return id;

  const body = schema.parse(await readBody(event));

  try {
    const updated = await InspectionRequestDispatchService.dispatchRequest(
      event,
      id,
      body,
      userinfo,
    );
    return useResponseSuccess(updated);
  } catch (error) {
    logApiError('inspection-request-dispatch', error, undefined, event);
    const businessError = legacyErrorToBusinessError(error);
    if (businessError) {
      return businessErrorResponse(event, businessError);
    }
    return internalServerErrorResponse(event, '报检派单失败');
  }
});
