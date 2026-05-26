import { defineEventHandler, readBody } from 'h3';
import { z } from 'zod';
import { AfterSalesRouteService } from '~/modules/after-sales/after-sales-route.service';
import { logApiError } from '~/utils/api-logger';
import {
  badRequestResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

const importSchema = z.object({
  items: z.array(z.record(z.string(), z.unknown())).min(1),
});

export default defineEventHandler(async (event) => {
  try {
    const body = importSchema.safeParse(await readBody(event));
    if (!body.success) return badRequestResponse(event, '未选择数据');
    const result = await AfterSalesRouteService.importItems(body.data.items);
    return useResponseSuccess(result);
  } catch (error: unknown) {
    logApiError('after-sales-import', error, undefined, event);
    return internalServerErrorResponse(event, '导入异常');
  }
});
