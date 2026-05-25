import { defineEventHandler, readBody } from 'h3';
import { z } from 'zod';
import { AfterSalesRouteService } from '~/modules/after-sales/after-sales-route.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import { getMissingRequiredFields } from '~/utils/request-validation';
import {
  badRequestResponse,
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';

const createAfterSalesSchema = z
  .object({ workOrderNumber: z.unknown() })
  .passthrough();

export default defineEventHandler(async (event) => {
  const userinfo = await verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

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
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    return internalServerErrorResponse(
      event,
      `创建售后记录失败: ${errorMessage}`,
    );
  }
});
