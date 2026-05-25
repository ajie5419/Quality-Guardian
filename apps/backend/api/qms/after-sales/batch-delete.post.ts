import { defineEventHandler, readBody } from 'h3';
import { z } from 'zod';
import { AfterSalesRouteService } from '~/modules/after-sales/after-sales-route.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  badRequestResponse,
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';

const batchDeleteSchema = z.object({ ids: z.array(z.string()).min(1) });

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  try {
    const parsed = batchDeleteSchema.safeParse(await readBody(event));
    if (!parsed.success)
      return badRequestResponse(event, '请提供有效的 ID 列表');
    const successCount = await AfterSalesRouteService.batchDelete(
      parsed.data.ids,
    );
    return useResponseSuccess({ successCount });
  } catch (error) {
    logApiError('batch-delete', error, undefined, event);
    return internalServerErrorResponse(event, '批量删除失败');
  }
});
