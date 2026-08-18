import { PERMISSION_CODES } from '@qgs/shared';
import { z } from 'zod';
import { authorizeWrite } from '~/modules/rbac';
import { WorkOrderRouteService } from '~/modules/work-order/work-order-route.service';
import { logApiError } from '~/utils/api-logger';
import { getCurrentUser } from '~/utils/current-user';
import { defineValidatedHandler } from '~/utils/define-validated-handler';
import {
  badRequestResponse,
  conflictResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

const bodySchema = z.object({}).passthrough();

export default defineValidatedHandler(bodySchema, async (event, body) => {
  await authorizeWrite(event, PERMISSION_CODES.QMS.WORK_ORDER.CREATE);
  const userinfo = getCurrentUser(event);

  try {
    return useResponseSuccess(
      await WorkOrderRouteService.create(event, body, userinfo),
    );
  } catch (error: unknown) {
    logApiError('work-order-create', error, undefined, event);
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith('BAD_REQUEST:')) {
      return badRequestResponse(event, message.replace('BAD_REQUEST:', ''));
    }
    if (message.startsWith('CONFLICT:')) {
      return conflictResponse(event, message.replace('CONFLICT:', ''));
    }
    return internalServerErrorResponse(event, `创建工单失败: ${message}`);
  }
});
