import { defineEventHandler, readBody } from 'h3';
import { MetrologyBorrowService } from '~/services/metrology-borrow.service';
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
import { getRequiredRouterParam } from '~/utils/route-param';

export default defineEventHandler(async (event) => {
  const id = getRequiredRouterParam(event, 'id', '缺少借用记录ID');
  if (typeof id !== 'string') {
    return id;
  }

  const body = (await readBody(event)) as Record<string, unknown>;
  const accessResult = verifyPublicMetrologyBorrowAccess(event, body.token);
  if (accessResult !== true) {
    return accessResult;
  }

  try {
    await MetrologyBorrowService.returnBorrow(
      id,
      body,
      PUBLIC_METROLOGY_BORROW_OPERATOR,
    );
    return useResponseSuccess(null);
  } catch (error: unknown) {
    logApiError('public-metrology-borrow-return', error);
    if (error instanceof Error) {
      return badRequestResponse(event, error.message);
    }
    return internalServerErrorResponse(event, '归还量具失败');
  }
});
