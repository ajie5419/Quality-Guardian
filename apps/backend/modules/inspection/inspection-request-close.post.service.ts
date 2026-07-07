import { defineEventHandler, readBody } from 'h3';
import { z } from 'zod';
import { InspectionRouteService } from '~/modules/inspection/inspection-route.service';
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

const closeRequestBodySchema = z.record(z.string(), z.unknown());

export default defineEventHandler(async (event) => {
  const userinfo = getCurrentUser(event);
  const id = getRequiredRouterParam(event, 'id', 'ID required');
  if (typeof id !== 'string') return id;
  const body = closeRequestBodySchema.parse(await readBody(event));

  try {
    const result = await InspectionRouteService.closeRequest(
      event,
      id,
      body,
      userinfo,
    );
    return useResponseSuccess(result);
  } catch (error) {
    logApiError('inspection-request-close', error, undefined, event);
    if (error instanceof BusinessError) {
      if (error.httpStatus === 404)
        return notFoundResponse(event, error.message);
      if (error.httpStatus === 403)
        return forbiddenResponse(event, error.message);
      return badRequestResponse(event, error.message);
    }
    return internalServerErrorResponse(event, '关闭报检任务失败');
  }
});
