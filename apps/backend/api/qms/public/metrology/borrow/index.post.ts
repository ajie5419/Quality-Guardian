import { defineEventHandler, readBody } from 'h3';
import { z } from 'zod';
import { MetrologyBorrowService } from '~/modules/metrology/borrow/metrology-borrow.service';
import {
  PUBLIC_METROLOGY_BORROW_OPERATOR,
  verifyPublicMetrologyBorrowAccess,
} from '~/modules/metrology/public-metrology-borrow';
import { logApiError } from '~/utils/api-logger';
import {
  badRequestResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

const publicBorrowBodySchema = z.object({
  borrowedAt: z.unknown().optional(),
  borrowerDepartment: z.unknown().optional(),
  borrowerName: z.unknown().optional(),
  expectedReturnAt: z.unknown().optional(),
  instrumentId: z.unknown().optional(),
  remark: z.unknown().optional(),
  token: z.string().optional(),
}).passthrough();

export default defineEventHandler(async (event) => {
  const body = publicBorrowBodySchema.parse(await readBody(event));
  const accessResult = verifyPublicMetrologyBorrowAccess(event, body.token);
  if (accessResult !== true) {
    return accessResult;
  }

  try {
    const payload = {
      borrowedAt: body.borrowedAt,
      borrowerDepartment: body.borrowerDepartment,
      borrowerName: body.borrowerName,
      expectedReturnAt: body.expectedReturnAt,
      instrumentId: body.instrumentId,
      remark: body.remark,
    };
    await MetrologyBorrowService.borrow(payload, PUBLIC_METROLOGY_BORROW_OPERATOR);
    return useResponseSuccess(null);
  } catch (error: unknown) {
    logApiError('public-metrology-borrow-create', error, undefined, event);
    if (error instanceof Error) {
      return badRequestResponse(event, error.message);
    }
    return internalServerErrorResponse(event, '新建借用记录失败');
  }
});
