import { z } from 'zod';
import { WorkOrderRouteService } from '~/modules/work-order/work-order-route.service';
import { logApiError } from '~/utils/api-logger';
import { getCurrentUser } from '~/utils/current-user';
import { defineValidatedHandler } from '~/utils/define-validated-handler';
import {
  badRequestResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

const payloadSchema = z.object({}).passthrough();
const bodySchema = z
  .object({ requirements: z.array(payloadSchema).optional() })
  .passthrough();

export default defineValidatedHandler(bodySchema, async (event, body) => {
  const userinfo = getCurrentUser(event);

  try {
    const requirements = z
      .array(payloadSchema)
      .parse(Array.isArray(body.requirements) ? body.requirements : [body]);
    if (requirements.length === 0)
      return badRequestResponse(event, '至少上传一条要求');
    if (
      requirements.some(
        (item) =>
          !String(item.workOrderNumber || '').trim() ||
          !String(item.requirementName || '').trim(),
      )
    ) {
      return badRequestResponse(event, '工单号和要求名称不能为空');
    }
    return useResponseSuccess(
      await WorkOrderRouteService.createRequirements(
        event,
        requirements,
        userinfo,
      ),
    );
  } catch (error) {
    logApiError('work-order-requirement-create', error, undefined, event);
    return internalServerErrorResponse(event, '上传工单要求失败');
  }
});
