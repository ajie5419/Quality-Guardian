import { defineEventHandler } from 'h3';
import { WorkOrderService } from '~/modules/work-order/work-order.service';
import { logApiError } from '~/utils/api-logger';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  try {
    return useResponseSuccess(await WorkOrderService.getAvailableYears());
  } catch (error) {
    logApiError('years', error, undefined, event);
    return internalServerErrorResponse(
      event,
      'Failed to fetch available years',
    );
  }
});
