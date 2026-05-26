import { defineEventHandler, readBody } from 'h3';
import { z } from 'zod';
import { InspectionRouteService } from '~/modules/inspection/inspection-route.service';
import { logApiError } from '~/utils/api-logger';
import { getCurrentUser } from '~/utils/current-user';
import {
  badRequestResponse,
  internalServerErrorResponse,
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
    if (!(error instanceof Error))
      return internalServerErrorResponse(event, '关闭报检任务失败');
    if (error.message.startsWith('VALIDATION:'))
      return badRequestResponse(
        event,
        error.message.replace('VALIDATION:', ''),
      );
    if (error.message.startsWith('NOT_FOUND:'))
      return badRequestResponse(event, error.message.replace('NOT_FOUND:', ''));
    if (error.message.startsWith('BAD_REQUEST:'))
      return badRequestResponse(
        event,
        error.message.replace('BAD_REQUEST:', ''),
      );
    if (error.message.startsWith('INTERNAL:'))
      return internalServerErrorResponse(
        event,
        error.message.replace('INTERNAL:', ''),
      );
    return internalServerErrorResponse(event, '关闭报检任务失败');
  }
});
