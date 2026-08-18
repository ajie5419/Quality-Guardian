import { PERMISSION_CODES } from '@qgs/shared';
import { defineEventHandler, readBody } from 'h3';
import { QualityLossService } from '~/modules/quality-loss/quality-loss.service';
import { authorizeWrite } from '~/modules/rbac';
import { logApiError } from '~/utils/api-logger';
import { businessErrorResponse, isBusinessError } from '~/utils/business-error';
import { getCurrentUser } from '~/utils/current-user';
import { parseNonEmptyIdList } from '~/utils/id-list';
import {
  badRequestResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  await authorizeWrite(event, PERMISSION_CODES.QMS.LOSS_ANALYSIS.DELETE);
  const userinfo = getCurrentUser(event);

  try {
    const body = (await readBody(event)) as { ids?: unknown };
    const ids = parseNonEmptyIdList(body.ids);

    if (!ids) {
      return badRequestResponse(event, 'Missing or invalid IDs');
    }

    const result = await QualityLossService.batchDelete(ids, {
      dataScope: event.context.dataScope,
      userId: String(userinfo.id),
    });
    return useResponseSuccess({ successCount: result.count });
  } catch (error: unknown) {
    logApiError('quality-loss-batch-delete', error, undefined, event);
    if (isBusinessError(error)) return businessErrorResponse(event, error);
    return internalServerErrorResponse(event, '批量删除质量损失记录失败');
  }
});
