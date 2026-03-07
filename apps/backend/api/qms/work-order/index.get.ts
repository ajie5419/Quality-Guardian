import { defineEventHandler, getQuery } from 'h3';
import { WorkOrderService } from '~/services/work-order.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';
import { parseWorkOrderListQuery } from '~/utils/work-order';

export default defineEventHandler(async (event) => {
  const userinfo = await verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  const query = getQuery(event) as Record<string, unknown>;
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
    logApiError('work-order', error);
    return internalServerErrorResponse(
      event,
      'Failed to fetch work order list',
    );
  }
});
