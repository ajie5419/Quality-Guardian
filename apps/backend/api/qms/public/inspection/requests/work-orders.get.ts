import { z } from 'zod';
import { InspectionApiService } from '~/modules/inspection/inspection-api.service';
import { logApiError } from '~/utils/api-logger';
import { defineValidatedHandler } from '~/utils/define-validated-handler';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

const schema = z.object({}).passthrough();

export default defineValidatedHandler(schema, async (event, query) => {
  try {
    return useResponseSuccess(await InspectionApiService.getPublicWorkOrders(query));
  } catch (error) {
    logApiError('public-inspection-request-work-order-list', error, undefined, event);
    return internalServerErrorResponse(event, '获取工单列表失败');
  }
});
