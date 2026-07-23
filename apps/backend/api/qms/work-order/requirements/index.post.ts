import { workOrderRequirementCreateBodySchema } from '~/modules/work-order/work-order-requirement.schema';
import { WorkOrderRouteService } from '~/modules/work-order/work-order-route.service';
import { logApiError } from '~/utils/api-logger';
import { businessErrorResponse, isBusinessError } from '~/utils/business-error';
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
    } catch (error: unknown) {
      logApiError('work-order-requirement-create', error, undefined, event);
      if (isBusinessError(error)) return businessErrorResponse(event, error);
      return internalServerErrorResponse(event, '上传工单要求失败');
    }
  },
);
