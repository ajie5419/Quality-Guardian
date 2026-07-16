import { workOrderRequirementCreateBodySchema } from '~/modules/work-order/work-order-requirement.schema';
import { WorkOrderRouteService } from '~/modules/work-order/work-order-route.service';
import { logApiError } from '~/utils/api-logger';
import { getCurrentUser } from '~/utils/current-user';
import { defineValidatedHandler } from '~/utils/define-validated-handler';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineValidatedHandler(
  workOrderRequirementCreateBodySchema,
  async (event, body) => {
    const userinfo = getCurrentUser(event);

    try {
      const requirements = 'requirements' in body ? body.requirements : [body];
      return useResponseSuccess(
        await WorkOrderRouteService.createRequirements(
          event,
          requirements,
          userinfo,
        ),
      );
    } catch (error) {
      logApiError('work-order-requirement-create', error, undefined, event);
      return internalServerErrorResponse(event, '上传工单要求失败');
    }
  },
);
