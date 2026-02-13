import { defineEventHandler, readBody } from 'h3';
import { QualityLossService } from '~/services/quality-loss.service';
import { logApiError } from '~/utils/api-logger';
import { parseNonEmptyIdList } from '~/utils/id-list';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  badRequestResponse,
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

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
    logApiError('quality-loss-batch-delete', error);
    return internalServerErrorResponse(event, '批量删除质量损失记录失败');
  }
});
