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

const workOrderStatsQuerySchema = z.object({}).passthrough();

export default defineValidatedHandler(
  workOrderStatsQuerySchema,
  async (event, query) => {
    const userinfo = getCurrentUser(event);

    const params = parseWorkOrderListQuery(query);

    try {
      const result = await WorkOrderService.getDashboardStats({
        ...params,
        userContext: {
          userId: String(userinfo.id || userinfo.userId || ''),
          username: userinfo.username,
        },
      });
      return useResponseSuccess(result);
    } catch (error) {
      logApiError('work-order-stats', error, undefined, event);
      return internalServerErrorResponse(
        event,
        'Failed to fetch work order dashboard stats',
      );
    }
  },
);
