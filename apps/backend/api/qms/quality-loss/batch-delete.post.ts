import { createError, defineEventHandler, readBody } from 'h3';
import { QualityLossService } from '~/services/quality-loss.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import { useResponseSuccess } from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
    });
  }

  try {
    const body = await readBody(event);
    const { ids } = body;
    if (!ids || !Array.isArray(ids)) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Missing or invalid IDs',
      });
    }

    const result = await QualityLossService.batchDelete(
      ids,
      String(userinfo.id),
    );
    return useResponseSuccess({ successCount: result.count });
  } catch (error: any) {
    if (error.statusCode) throw error;
    logApiError('quality-loss-batch-delete', error);
    throw createError({
      statusCode: 500,
      statusMessage: 'Internal Server Error',
    });
  }
});
