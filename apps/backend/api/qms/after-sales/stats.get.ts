import { defineEventHandler, getQuery } from 'h3';
import { AfterSalesService } from '~/services/after-sales.service';
import {
  parseAfterSalesDateMode,
  parseAfterSalesDateValue,
} from '~/utils/after-sales-query';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = await verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  const {
    dateMode: rawDateMode,
    dateValue: rawDateValue,
    year,
  } = getQuery(event);
  const currentYear = year
    ? Number.parseInt(String(year), 10)
    : new Date().getFullYear();
  const dateMode = parseAfterSalesDateMode(rawDateMode);
  const dateValue = parseAfterSalesDateValue(rawDateValue);

  try {
    const stats = await AfterSalesService.getStats({
      dateMode,
      dateValue,
      year: Number.isNaN(currentYear) ? undefined : currentYear,
    });
    return useResponseSuccess(stats);
  } catch (error) {
    logApiError('after-sales-stats', error);
    return internalServerErrorResponse(
      event,
      'Failed to fetch after-sales stats',
    );
  }
});
