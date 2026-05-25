import { defineEventHandler, readBody } from 'h3';
import { MetrologyBorrowService } from '~/modules/metrology/borrow/metrology-borrow.service';
import { logApiError } from '~/utils/api-logger';
import {
  PUBLIC_METROLOGY_BORROW_OPERATOR,
  verifyPublicMetrologyBorrowAccess,
} from '~/utils/public-metrology-borrow';
import {
  badRequestResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const body = (await readBody(event)) as Record<string, unknown>;
  const accessResult = verifyPublicMetrologyBorrowAccess(event, body.token);
  if (accessResult !== true) {
    return accessResult;
  }

  try {
    await MetrologyBorrowService.borrow(
      body,
      PUBLIC_METROLOGY_BORROW_OPERATOR,
    );
    return useResponseSuccess(null);
  } catch (error: unknown) {
    logApiError('public-metrology-borrow-create', error, undefined, event);
    if (error instanceof Error) {
      return badRequestResponse(event, error.message);
    }
    return internalServerErrorResponse(event, '新建借用记录失败');
  }
});
