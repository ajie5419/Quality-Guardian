import { defineEventHandler, getQuery } from 'h3';
import { AfterSalesService } from '~/services/after-sales.service';
import { parseAfterSalesListQuery } from '~/utils/after-sales-query';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  const query = getQuery(event) as Record<string, unknown>;
  const params = parseAfterSalesListQuery(query);

  try {
    const list = await AfterSalesService.getList(params);
    return useResponseSuccess(list);
  } catch (error) {
    logApiError('after-sales', error);
    return internalServerErrorResponse(
      event,
      'Failed to fetch after-sales list',
    );
  }
});
