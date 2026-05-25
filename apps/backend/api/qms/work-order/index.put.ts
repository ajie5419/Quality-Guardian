import { z } from 'zod';
import { WorkOrderRouteService } from '~/modules/work-order/work-order-route.service';
import { logApiError } from '~/utils/api-logger';
import { defineValidatedHandler } from '~/utils/define-validated-handler';
import { verifyAccessToken } from '~/utils/jwt-utils';
import { getRequiredQueryParam } from '~/utils/query-param';
import {
  internalServerErrorResponse,
  notFoundResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';

const bodySchema = z.object({}).passthrough();

export default defineValidatedHandler(bodySchema, async (event, body) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) return unAuthorizedResponse(event);

  const id = getRequiredQueryParam(event, 'id', '缺少工单号');
  if (typeof id !== 'string') return id;

  try {
    await WorkOrderRouteService.update(event, id, body, userinfo);
    return useResponseSuccess(null);
  } catch (error: unknown) {
    logApiError('work-order', error, undefined, event);
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message.startsWith('NOT_FOUND:')) {
      return notFoundResponse(event, message.replace('NOT_FOUND:', ''));
    }
    return internalServerErrorResponse(event, `更新工单失败: ${message}`);
  }
});
