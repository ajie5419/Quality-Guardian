import { defineEventHandler, getQuery } from 'h3';
import {
  parseAfterSalesDateMode,
  parseAfterSalesDateValue,
} from '~/modules/after-sales/after-sales-query';
import { AfterSalesService } from '~/modules/after-sales/after-sales.service';
import { logApiError } from '~/utils/api-logger';
import { businessErrorResponse, isBusinessError } from '~/utils/business-error';
import { getCurrentUser } from '~/utils/current-user';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
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
    const userinfo = getCurrentUser(event);
    const stats = await AfterSalesService.getStats(
      {
        dateMode,
        dateValue,
        year: Number.isNaN(currentYear) ? undefined : currentYear,
      },
      {
        dataScope: event.context.dataScope,
        user: {
          userId: String(userinfo.id || userinfo.userId || ''),
          username: userinfo.username,
        },
      },
    );
    return useResponseSuccess(stats);
  } catch (error) {
    logApiError('after-sales-stats', error, undefined, event);
    if (isBusinessError(error)) return businessErrorResponse(event, error);
    return internalServerErrorResponse(
      event,
      'Failed to fetch after-sales stats',
    );
  }
});
