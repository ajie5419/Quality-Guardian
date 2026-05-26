import { defineEventHandler, readBody } from 'h3';
import { z } from 'zod';
import { MetrologyBorrowService } from '~/modules/metrology/borrow/metrology-borrow.service';
import { logApiError } from '~/utils/api-logger';
import { getCurrentUser } from '~/utils/current-user';
import {
  badRequestResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

const borrowSchema = z.record(z.string(), z.unknown());

export default defineEventHandler(async (event) => {
  const userinfo = getCurrentUser(event);

  try {
    const body = borrowSchema.parse(await readBody(event));
    await MetrologyBorrowService.borrow(body, userinfo.username);
    return useResponseSuccess(null);
  } catch (error: unknown) {
    logApiError('metrology-borrow-create', error, undefined, event);
    if (error instanceof Error) {
      return badRequestResponse(event, error.message);
    }
    return internalServerErrorResponse(event, '新建借用记录失败');
  }
});
