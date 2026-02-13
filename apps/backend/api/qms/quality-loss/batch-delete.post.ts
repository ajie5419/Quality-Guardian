import { defineEventHandler, readBody, setResponseStatus } from 'h3';
import { QualityLossService } from '~/services/quality-loss.service';
import { logApiError } from '~/utils/api-logger';
import { normalizeIdList } from '~/utils/id-list';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  unAuthorizedResponse,
  useResponseError,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  try {
    const body = (await readBody(event)) as { ids?: unknown };
    const ids = normalizeIdList(body.ids);

    if (ids.length === 0) {
      setResponseStatus(event, 400);
      return useResponseError('Missing or invalid IDs');
    }

    const result = await QualityLossService.batchDelete(
      ids,
      String(userinfo.id),
    );
    return useResponseSuccess({ successCount: result.count });
  } catch (error: unknown) {
    logApiError('quality-loss-batch-delete', error);
    setResponseStatus(event, 500);
    return useResponseError('Internal Server Error');
  }
});
