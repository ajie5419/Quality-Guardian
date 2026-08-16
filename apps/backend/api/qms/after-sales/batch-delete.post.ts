import { PERMISSION_CODES } from '@qgs/shared';
import { defineEventHandler, readBody } from 'h3';
import { z } from 'zod';
import { AfterSalesRouteService } from '~/modules/after-sales/after-sales-route.service';
import { authorizeWrite } from '~/modules/rbac';
import { logApiError } from '~/utils/api-logger';
import {
  badRequestResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

const batchDeleteSchema = z.object({ ids: z.array(z.string()).min(1) });

export default defineEventHandler(async (event) => {
  await authorizeWrite(event, PERMISSION_CODES.QMS.AFTER_SALES.DELETE);
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
