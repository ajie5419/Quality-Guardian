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
    const result = await MetrologyBorrowService.getList({
      borrowerDepartment:
        String(query.borrowerDepartment || '').trim() || undefined,
      borrowerName: String(query.borrowerName || '').trim() || undefined,
      keyword: String(query.keyword || '').trim() || undefined,
      page: Number(query.page || 1),
      pageSize: Number(query.pageSize || 20),
      sortBy: String(query.sortBy || '').trim() || undefined,
      sortOrder:
        query.sortOrder === 'asc' || query.sortOrder === 'desc'
          ? query.sortOrder
          : undefined,
      status: String(query.status || '').trim() || undefined,
    });
    return useResponseSuccess(result);
  } catch (error) {
    logApiError('metrology-borrow-list', error, undefined, event);
    return internalServerErrorResponse(event, 'Failed to fetch borrow list');
  }
});
