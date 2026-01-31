import { defineEventHandler, getQuery } from 'h3';
import { AfterSalesService } from '~/services/after-sales.service';
import { verifyAccessToken } from '~/utils/jwt-utils';
import { unAuthorizedResponse, useResponseSuccess } from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  const { year } = getQuery(event);
  const currentYear = year
    ? Number.parseInt(String(year))
    : new Date().getFullYear();

  const stats = await AfterSalesService.getStats(currentYear);

  return useResponseSuccess(stats);
});
