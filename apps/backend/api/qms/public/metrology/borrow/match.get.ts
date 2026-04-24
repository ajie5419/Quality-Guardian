import { defineEventHandler, getQuery } from 'h3';
import { MetrologyBorrowService } from '~/services/metrology-borrow.service';
import { logApiError } from '~/utils/api-logger';
import { verifyPublicMetrologyBorrowAccess } from '~/utils/public-metrology-borrow';
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
    logApiError('public-metrology-borrow-match', error);
    return internalServerErrorResponse(event, 'Failed to match instruments');
  }
});
