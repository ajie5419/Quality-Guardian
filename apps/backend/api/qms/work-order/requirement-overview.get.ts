import { z } from 'zod';
import { WorkOrderRequirementService } from '~/modules/work-order-requirement/work-order-requirement.service';
import { logApiError } from '~/utils/api-logger';
import { getCurrentUser } from '~/utils/current-user';
import { defineValidatedHandler } from '~/utils/define-validated-handler';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';
import { parseWorkOrderListQuery } from '~/utils/work-order';

const workOrderRequirementOverviewQuerySchema = z.object({}).passthrough();

export default defineValidatedHandler(
  workOrderRequirementOverviewQuerySchema,
  async (event, query) => {
    const userinfo = getCurrentUser(event);

    const params = parseWorkOrderListQuery(query);

    try {
      const result = await WorkOrderRequirementService.getRequirementOverview({
        ...params,
        userContext: {
          userId: String(userinfo.id || userinfo.userId || ''),
          username: userinfo.username,
        },
      });
      return useResponseSuccess(result);
    } catch (error) {
      logApiError('work-order-requirement-overview', error, undefined, event);
      return internalServerErrorResponse(
        event,
        'Failed to fetch requirement overview',
      );
    }
  },
);
