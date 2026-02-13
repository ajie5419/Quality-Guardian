import { defineEventHandler, getQuery } from 'h3';
import { AfterSalesService } from '~/services/after-sales.service';
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

  const { year } = getQuery(event);
  const currentYear = year
    ? Number.parseInt(String(year))
    : new Date().getFullYear();

  try {
    const stats = await AfterSalesService.getStats(currentYear);
    return useResponseSuccess(stats);
  } catch (error) {
    logApiError('after-sales-stats', error);
    return internalServerErrorResponse(
      event,
      'Failed to fetch after-sales stats',
    );
  }
});
