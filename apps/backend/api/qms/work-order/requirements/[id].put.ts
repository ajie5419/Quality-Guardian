import { getRouterParam } from 'h3';
import { workOrderRequirementUpdateBodySchema } from '~/modules/work-order/work-order-requirement.schema';
import { WorkOrderRouteService } from '~/modules/work-order/work-order-route.service';
import { logApiError } from '~/utils/api-logger';
import { getCurrentUser } from '~/utils/current-user';
import { defineValidatedHandler } from '~/utils/define-validated-handler';
import {
  badRequestResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineValidatedHandler(
  workOrderRequirementUpdateBodySchema,
  async (event, body) => {
    const userinfo = getCurrentUser(event);

    const id = String(getRouterParam(event, 'id') || '').trim();
    if (!id) return badRequestResponse(event, '无效要求ID');

    try {
      return useResponseSuccess(
        await WorkOrderRouteService.updateRequirement(
          event,
          id,
          body,
          userinfo,
        ),
      );
    } catch (error) {
      logApiError('work-order-requirement-update', error, undefined, event);
      return internalServerErrorResponse(event, '更新工单要求失败');
    }
  },
);
