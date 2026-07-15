import { defineEventHandler, readBody } from 'h3';
import { z } from 'zod';
import { AfterSalesRouteService } from '~/modules/after-sales/after-sales-route.service';
import { logApiError } from '~/utils/api-logger';
import { businessErrorResponse, isBusinessError } from '~/utils/business-error';
import { getCurrentUser } from '~/utils/current-user';
import { getMissingRequiredFields } from '~/utils/request-validation';
import {
  badRequestResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

const createAfterSalesSchema = z
  .object({ workOrderNumber: z.unknown() })
  .passthrough();

export default defineEventHandler(async (event) => {
  const userinfo = getCurrentUser(event);

  try {
    const body = createAfterSalesSchema.parse(await readBody(event));
    const missingFields = getMissingRequiredFields(body, ['workOrderNumber']);
    if (missingFields.length > 0) {
      return badRequestResponse(event, `缺少必填字段: ${missingFields[0]}`);
    }
    const newItem = await AfterSalesRouteService.create(body, userinfo);
    return useResponseSuccess(newItem);
  } catch (error: unknown) {
    logApiError('after-sales-create', error, undefined, event);
    if (isBusinessError(error)) return businessErrorResponse(event, error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    return internalServerErrorResponse(
      event,
      `创建售后记录失败: ${errorMessage}`,
    );
  }
});
