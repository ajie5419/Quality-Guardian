import { z } from 'zod';
import { WorkOrderService } from '~/modules/work-order/work-order.service';
import { logApiError } from '~/utils/api-logger';
import { getCurrentUser } from '~/utils/current-user';
import { defineValidatedHandler } from '~/utils/define-validated-handler';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';
import { parseWorkOrderListQuery } from '~/utils/work-order';

const workOrderListQuerySchema = z.object({}).passthrough();

export default defineValidatedHandler(
  workOrderListQuerySchema,
  async (event, query) => {
    const userinfo = getCurrentUser(event);

    const params = parseWorkOrderListQuery(query);

    try {
      const result = await WorkOrderService.getList({
        ...params,
        userContext: {
          userId: String(userinfo.id || userinfo.userId || ''),
          username: userinfo.username,
        },
      });

      return useResponseSuccess(result);
    } catch (error) {
      logApiError('work-order', error, undefined, event);
      return internalServerErrorResponse(
        event,
        'Failed to fetch work order list',
      );
    }
  },
);
