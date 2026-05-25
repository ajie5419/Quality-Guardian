import { defineEventHandler, getQuery } from 'h3';
import { z } from 'zod';
import { WorkOrderRouteService } from '~/modules/work-order/work-order-route.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  badRequestResponse,
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';

const workspaceAggregateQuerySchema = z.object({
  workOrderNumber: z.string().optional(),
});

export default defineEventHandler(async (event) => {
  const userinfo = await verifyAccessToken(event);
  if (!userinfo) return unAuthorizedResponse(event);

  const query = workspaceAggregateQuerySchema.parse(getQuery(event));
  const workOrderNumber = String(query.workOrderNumber || '').trim();
  if (!workOrderNumber) {
    return badRequestResponse(event, '工单号不能为空');
  }

  try {
    return useResponseSuccess(
      await WorkOrderRouteService.getWorkOrderAggregate(workOrderNumber),
    );
  } catch (error) {
    logApiError('workspace-work-order-aggregate', error, undefined, event);
    return internalServerErrorResponse(event, '获取工单聚合信息失败');
  }
});
