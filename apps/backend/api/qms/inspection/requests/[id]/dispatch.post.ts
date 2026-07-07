import { defineEventHandler, readBody } from 'h3';
import { z } from 'zod';
import { InspectionRequestDispatchService } from '~/modules/inspection/inspection-request-dispatch.service';
import { logApiError } from '~/utils/api-logger';
import { BusinessError } from '~/utils/business-error';
import { getCurrentUser } from '~/utils/current-user';
import {
  badRequestResponse,
  forbiddenResponse,
  internalServerErrorResponse,
  notFoundResponse,
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
    if (error instanceof BusinessError) {
      if (error.httpStatus === 404)
        return notFoundResponse(event, error.message);
      if (error.httpStatus === 403)
        return forbiddenResponse(event, error.message);
      return badRequestResponse(event, error.message);
    }
    return internalServerErrorResponse(event, '报检派单失败');
  }
});
