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
    const result = await MetrologyBorrowService.getOverview({
      borrowerDepartment:
        String(query.borrowerDepartment || '').trim() || undefined,
      borrowerName: String(query.borrowerName || '').trim() || undefined,
      keyword: String(query.keyword || '').trim() || undefined,
    });
    return useResponseSuccess(result);
  } catch (error) {
    logApiError('metrology-borrow-overview', error, undefined, event);
    return internalServerErrorResponse(
      event,
      'Failed to fetch metrology borrow overview',
    );
  }
});
