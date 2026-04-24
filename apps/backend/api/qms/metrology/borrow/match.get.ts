import { defineEventHandler, getQuery } from 'h3';
import { MetrologyBorrowService } from '~/services/metrology-borrow.service';
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

  try {
    const query = getQuery(event);
    const result = await MetrologyBorrowService.matchInstruments(
      String(query.keyword || '').trim(),
    );
    return useResponseSuccess(result);
  } catch (error) {
    logApiError('metrology-borrow-match', error);
    return internalServerErrorResponse(event, 'Failed to match instruments');
  }
});
