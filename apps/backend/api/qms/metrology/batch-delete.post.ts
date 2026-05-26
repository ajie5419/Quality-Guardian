import { defineEventHandler, readBody } from 'h3';
import { z } from 'zod';
import { MetrologyService } from '~/modules/metrology/metrology.service';
import { recordBusinessAuditLog } from '~/modules/system-log/audit-log';
import { logApiError } from '~/utils/api-logger';
import { getCurrentUser } from '~/utils/current-user';
import {
  badRequestResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

const batchDeleteSchema = z.object({ ids: z.array(z.string()).min(1) });

export default defineEventHandler(async (event) => {
  const userinfo = getCurrentUser(event);

  try {
    const parsed = batchDeleteSchema.safeParse(await readBody(event));
    if (!parsed.success)
      return badRequestResponse(event, '请提供有效的 ID 列表');
    const ids = parsed.data.ids;
    const result = await MetrologyService.batchDelete(ids, userinfo.username);

    await recordBusinessAuditLog(event, {
      userId: userinfo.id,
      action: 'DELETE',
      targetType: 'metrology',
      targetId: ids.join(','),
      detailsTemplate: '批量删除计量器具: {{count}} 条',
      detailsVariables: {
        count: result.count,
      },
    });

    return useResponseSuccess({ count: result.count });
  } catch (error) {
    logApiError('metrology-batch-delete', error, undefined, event);
    return internalServerErrorResponse(event, '批量删除计量器具失败');
  }
});
