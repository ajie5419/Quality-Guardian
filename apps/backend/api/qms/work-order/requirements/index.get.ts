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

const querySchema = z
  .object({ workOrderNumber: z.string().optional() })
  .passthrough();

export default defineValidatedHandler(querySchema, async (event, query) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) return unAuthorizedResponse(event);

  const workOrderNumber = String(query.workOrderNumber || '').trim();
  if (!workOrderNumber) return badRequestResponse(event, '工单号不能为空');

  try {
    return useResponseSuccess(
      await WorkOrderRouteService.getRequirements(workOrderNumber),
    );
  } catch (error) {
    logApiError('work-order-requirement-list', error, undefined, event);
    return internalServerErrorResponse(event, '获取工单要求失败');
  }
});
