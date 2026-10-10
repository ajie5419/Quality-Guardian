import { METROLOGY_PERMISSION_CODES } from '@qgs/shared';
import { defineEventHandler, readBody } from 'h3';
import { z } from 'zod';
import { handleBorrowRouteError } from '~/modules/metrology/borrow/metrology-borrow-route-error';
import { MetrologyBorrowService } from '~/modules/metrology/borrow/metrology-borrow.service';
import { authorizeWrite } from '~/modules/rbac';
import { logApiError } from '~/utils/api-logger';
import { getCurrentUser } from '~/utils/current-user';
import { useResponseSuccess } from '~/utils/response';

const borrowSchema = z.record(z.string(), z.unknown());

export default defineEventHandler(async (event) => {
  try {
    await authorizeWrite(event, METROLOGY_PERMISSION_CODES.BORROW_CREATE);
    const userinfo = getCurrentUser(event);
    const body = borrowSchema.parse(await readBody(event));
    await MetrologyBorrowService.borrow(body, userinfo.username);
    return useResponseSuccess(null);
  } catch (error: unknown) {
    logApiError('metrology-borrow-create', error, undefined, event);
    return handleBorrowRouteError(event, error, '新建借用记录失败');
  }
});
