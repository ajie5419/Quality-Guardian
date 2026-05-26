import { z } from 'zod';
import { WorkOrderRouteService } from '~/modules/work-order/work-order-route.service';
import { logApiError } from '~/utils/api-logger';
import { getCurrentUser } from '~/utils/current-user';
import { defineValidatedHandler } from '~/utils/define-validated-handler';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

const workOrderRequirementBoardQuerySchema = z.object({}).passthrough();

export default defineValidatedHandler(
  workOrderRequirementBoardQuerySchema,
  async (event, query) => {
    const userinfo = getCurrentUser(event);

    try {
      return useResponseSuccess(
        await WorkOrderRouteService.getRequirementBoard(query, userinfo),
      );
    } catch (error) {
      logApiError('work-order-requirement-board', error, undefined, event);
      return internalServerErrorResponse(
        event,
        'Failed to fetch requirement board',
      );
    }
  },
);
