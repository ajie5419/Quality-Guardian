import { z } from 'zod';
import { WorkOrderRouteService } from '~/modules/work-order/work-order-route.service';
import { logApiError } from '~/utils/api-logger';
import { getCurrentUser } from '~/utils/current-user';
import { defineValidatedHandler } from '~/utils/define-validated-handler';
import { parseNonEmptyIdList } from '~/utils/id-list';
import {
  badRequestResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

const bodySchema = z.object({ ids: z.unknown().optional() }).passthrough();

export default defineValidatedHandler(bodySchema, async (event, body) => {
  const userinfo = getCurrentUser(event);

  try {
    const ids = parseNonEmptyIdList(body.ids);
    if (!ids) return badRequestResponse(event, '请提供有效的 ID 列表');
    return useResponseSuccess(
      await WorkOrderRouteService.batchDelete(event, ids, userinfo),
    );
  } catch (error) {
    logApiError('batch-delete', error, undefined, event);
    return internalServerErrorResponse(event, '批量删除失败');
  }
});
