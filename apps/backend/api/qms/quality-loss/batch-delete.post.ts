import { defineEventHandler, readBody } from 'h3';
import { QualityLossService } from '~/modules/quality-loss/quality-loss.service';
import { logApiError } from '~/utils/api-logger';
import { getCurrentUser } from '~/utils/current-user';
import { parseNonEmptyIdList } from '~/utils/id-list';
import {
  badRequestResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = getCurrentUser(event);

  try {
    const body = (await readBody(event)) as { ids?: unknown };
    const ids = parseNonEmptyIdList(body.ids);

    if (!ids) {
      return badRequestResponse(event, 'Missing or invalid IDs');
    }

    const result = await QualityLossService.batchDelete(
      ids,
      String(userinfo.id),
    );
    return useResponseSuccess({ successCount: result.count });
  } catch (error: unknown) {
    logApiError('quality-loss-batch-delete', error, undefined, event);
    return internalServerErrorResponse(event, '批量删除质量损失记录失败');
  }
});
