import { z } from 'zod';
import { WorkOrderRouteService } from '~/modules/work-order/work-order-route.service';
import { logApiError } from '~/utils/api-logger';
import { defineValidatedHandler } from '~/utils/define-validated-handler';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  badRequestResponse,
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';

const querySchema = z.object({}).passthrough();

export default defineValidatedHandler(querySchema, async (event, query) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) return unAuthorizedResponse(event);

  try {
    return useResponseSuccess(
      await WorkOrderRouteService.exportList(event, query, userinfo),
    );
  } catch (error) {
    logApiError('work-order-export', error, undefined, event);
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith('BAD_REQUEST:'))
      return badRequestResponse(event, message.replace('BAD_REQUEST:', ''));
    return internalServerErrorResponse(
      event,
      'Failed to export work order list',
    );
  }
});
