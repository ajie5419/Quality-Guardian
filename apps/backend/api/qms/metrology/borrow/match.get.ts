import { defineEventHandler, getQuery } from 'h3';
import { MetrologyBorrowService } from '~/modules/metrology/borrow/metrology-borrow.service';
import { logApiError } from '~/utils/api-logger';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event);
    const result = await MetrologyBorrowService.matchInstruments(
      String(query.keyword || '').trim(),
    );
    return useResponseSuccess(result);
  } catch (error) {
    logApiError('metrology-borrow-match', error, undefined, event);
    return internalServerErrorResponse(event, 'Failed to match instruments');
  }
});
