import { defineEventHandler, getQuery, setResponseStatus } from 'h3';
import { AfterSalesService } from '~/services/after-sales.service';
import { logApiError } from '~/utils/api-logger';
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

  const { year } = getQuery(event);
  const currentYear = year
    ? Number.parseInt(String(year))
    : new Date().getFullYear();

  try {
    const stats = await AfterSalesService.getStats(currentYear);
    return useResponseSuccess(stats);
  } catch (error) {
    logApiError('after-sales-stats', error);
    setResponseStatus(event, 500);
    return useResponseError('Failed to fetch after-sales stats');
  }
});
