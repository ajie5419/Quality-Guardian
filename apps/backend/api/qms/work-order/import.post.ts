import { PERMISSION_CODES } from '@qgs/shared';
import { z } from 'zod';
import { authorizeWrite } from '~/modules/rbac';
import { WorkOrderRouteService } from '~/modules/work-order/work-order-route.service';
import { logApiError } from '~/utils/api-logger';
import { getCurrentUser } from '~/utils/current-user';
import { defineValidatedHandler } from '~/utils/define-validated-handler';
import { parseNonEmptyArray } from '~/utils/request-validation';
import {
  badRequestResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

const bodySchema = z
  .object({ items: z.array(z.record(z.unknown())).optional() })
  .passthrough();

export default defineValidatedHandler(bodySchema, async (event, body) => {
  await authorizeWrite(event, PERMISSION_CODES.QMS.WORK_ORDER.IMPORT);
  const userinfo = getCurrentUser(event);

  try {
    const items = parseNonEmptyArray<Record<string, unknown>>(body.items);
    if (!items) return badRequestResponse(event, '未发现可导入的数据');
    return useResponseSuccess(
      await WorkOrderRouteService.importRows(event, items, userinfo),
    );
  } catch (error: unknown) {
    logApiError('import', error, undefined, event);
    return internalServerErrorResponse(event, '数据处理异常');
  }
});
