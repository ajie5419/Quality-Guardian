import { defineEventHandler, readBody } from 'h3';
import { z } from 'zod';
import { InspectionApiService } from '~/modules/inspection/inspection-api.service';
import { logApiError } from '~/utils/api-logger';
import { parseNonEmptyIdList } from '~/utils/id-list';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  badRequestResponse,
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';

const schema = z.object({ ids: z.unknown().optional() });

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) return unAuthorizedResponse(event);

  try {
    const body = schema.parse(await readBody(event));
    const ids = parseNonEmptyIdList(body.ids);
    if (!ids) return badRequestResponse(event, '请提供有效的 ID 列表');
    return useResponseSuccess({
      successCount: await InspectionApiService.batchDeleteIssues(
        event,
        userinfo,
        ids,
      ),
    });
  } catch (error) {
    logApiError('batch-delete', error, undefined, event);
    return internalServerErrorResponse(event, '批量删除失败');
  }
});
