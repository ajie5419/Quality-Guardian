import { createError, defineEventHandler, getRouterParam } from 'h3';
import { AfterSalesService } from '~/services/after-sales.service';
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

  const id = getRouterParam(event, 'id');
  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing ID',
    });
  }

  try {
    await AfterSalesService.deleteRecord(id, String(userinfo.id));
    return useResponseSuccess(null);
  } catch (error) {
    logApiError('after-sales', error);
    throw createError({
      statusCode: 500,
      statusMessage: 'Internal Server Error',
    });
  }
});
