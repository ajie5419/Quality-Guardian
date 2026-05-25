import { defineEventHandler, readBody } from 'h3';
import { z } from 'zod';
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
import { getRequiredRouterParam } from '~/utils/route-param';

const publicReturnBodySchema = z
  .object({
    remark: z.unknown().optional(),
    token: z.string().optional(),
  })
  .passthrough();

export default defineEventHandler(async (event) => {
  const id = getRequiredRouterParam(event, 'id', '缺少借用记录ID');
  if (typeof id !== 'string') {
    return id;
  }

  const body = publicReturnBodySchema.parse(await readBody(event));
  const accessResult = verifyPublicMetrologyBorrowAccess(event, body.token);
  if (accessResult !== true) {
    return accessResult;
  }

  try {
    const payload = { remark: body.remark };
    await MetrologyBorrowService.requestReturn(
      id,
      payload,
      PUBLIC_METROLOGY_BORROW_OPERATOR,
    );
    return useResponseSuccess(null);
  } catch (error: unknown) {
    logApiError('public-metrology-borrow-return', error, undefined, event);
    if (error instanceof Error) {
      return badRequestResponse(event, error.message);
    }
    return internalServerErrorResponse(event, '归还量具失败');
  }
});
