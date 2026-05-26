import { defineEventHandler, readBody } from 'h3';
import { z } from 'zod';
import { InspectionApiService } from '~/modules/inspection/inspection-api.service';
import { normalizeInspectionRequestText } from '~/modules/inspection/inspection-request';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  badRequestResponse,
  internalServerErrorResponse,
  notFoundResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';

const schema = z.object({}).passthrough();

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) return unAuthorizedResponse(event);

  const id = getRequiredRouterParam(event, 'id', 'ID required');
  if (typeof id !== 'string') return id;

  const body = schema.parse(await readBody(event));
  const inspectorId = normalizeInspectionRequestText(body.inspectorId);
  if (!inspectorId) return badRequestResponse(event, '检验员不能为空');

  try {
    const updated = await InspectionApiService.dispatchRequest(
      event,
      id,
      body,
      userinfo,
    );
    return useResponseSuccess(updated);
  } catch (error) {
    logApiError('inspection-request-dispatch', error, undefined, event);
    if (error instanceof Error && error.message.startsWith('NOT_FOUND:'))
      return notFoundResponse(event, error.message.replace('NOT_FOUND:', ''));
    if (error instanceof Error && error.message.startsWith('BAD_REQUEST:'))
      return badRequestResponse(
        event,
        error.message.replace('BAD_REQUEST:', ''),
      );
    return internalServerErrorResponse(event, '报检派单失败');
  }
});
