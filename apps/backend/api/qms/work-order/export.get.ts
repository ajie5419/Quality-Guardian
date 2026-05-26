import { z } from 'zod';
import { WorkOrderRouteService } from '~/modules/work-order/work-order-route.service';
import { logApiError } from '~/utils/api-logger';
import { getCurrentUser } from '~/utils/current-user';
import { defineValidatedHandler } from '~/utils/define-validated-handler';
import {
  badRequestResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

const querySchema = z.object({}).passthrough();

export default defineValidatedHandler(querySchema, async (event, query) => {
  const userinfo = getCurrentUser(event);

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
