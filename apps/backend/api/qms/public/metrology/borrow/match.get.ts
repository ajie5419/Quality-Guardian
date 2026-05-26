import { defineEventHandler, getQuery } from 'h3';
import { MetrologyBorrowService } from '~/modules/metrology/borrow/metrology-borrow.service';
import { verifyPublicMetrologyBorrowAccess } from '~/modules/metrology/public-metrology-borrow';
import { logApiError } from '~/utils/api-logger';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const accessResult = verifyPublicMetrologyBorrowAccess(event, query.token);
  if (accessResult !== true) {
    return accessResult;
  }

  try {
    const result = await MetrologyBorrowService.matchInstruments(
      String(query.keyword || '').trim(),
    );
    return useResponseSuccess(result);
  } catch (error) {
    logApiError('public-metrology-borrow-match', error, undefined, event);
    return internalServerErrorResponse(event, 'Failed to match instruments');
  }
});
