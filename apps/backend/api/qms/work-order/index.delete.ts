import { defineEventHandler } from 'h3';
import { WorkOrderRouteService } from '~/modules/work-order/work-order-route.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import { getRequiredQueryParam } from '~/utils/query-param';
import {
  internalServerErrorResponse,
  notFoundResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  const id = getRequiredQueryParam(event, 'id', '缺少工单号');
  if (typeof id !== 'string') {
    return id;
  }

  try {
    await WorkOrderRouteService.deleteById(event, id, userinfo);
    return useResponseSuccess(null);
  } catch (error) {
    logApiError('work-order', error, undefined, event);
    if (error instanceof Error && error.message === 'NOT_FOUND') {
      return notFoundResponse(event, '删除工单失败：记录不存在');
    }
    return internalServerErrorResponse(event, '删除工单失败');
  }
});
