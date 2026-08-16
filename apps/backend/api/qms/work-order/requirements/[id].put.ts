import { PERMISSION_CODES } from '@qgs/shared';
import { getRouterParam } from 'h3';
import { authorizeWrite } from '~/modules/rbac';
import { workOrderRequirementMutationBodySchema } from '~/modules/work-order/work-order-requirement.schema';
import { WorkOrderRouteService } from '~/modules/work-order/work-order-route.service';
import { logApiError } from '~/utils/api-logger';
import { businessErrorResponse, isBusinessError } from '~/utils/business-error';
import { getCurrentUser } from '~/utils/current-user';
import { defineValidatedHandler } from '~/utils/define-validated-handler';
import {
  badRequestResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineValidatedHandler(
  workOrderRequirementMutationBodySchema,
  async (event, body) => {
    await authorizeWrite(event, PERMISSION_CODES.QMS.WORK_ORDER.EDIT);
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
    } catch (error: unknown) {
      logApiError('work-order-requirement-update', error, undefined, event);
      if (isBusinessError(error)) return businessErrorResponse(event, error);
      return internalServerErrorResponse(event, '更新工单要求失败');
    }
  },
);
