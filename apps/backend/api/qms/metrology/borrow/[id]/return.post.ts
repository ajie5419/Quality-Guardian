import { METROLOGY_PERMISSION_CODES } from '@qgs/shared';
import { defineEventHandler, readBody } from 'h3';
import { z } from 'zod';
import { MetrologyBorrowService } from '~/modules/metrology/borrow/metrology-borrow.service';
import { authorizeWrite } from '~/modules/rbac';
import { logApiError } from '~/utils/api-logger';
import { getCurrentUser } from '~/utils/current-user';
import {
  badRequestResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';

const returnSchema = z.record(z.string(), z.unknown());

export default defineEventHandler(async (event) => {
  await authorizeWrite(event, METROLOGY_PERMISSION_CODES.BORROW_RETURN);
  const userinfo = getCurrentUser(event);

  const id = getRequiredRouterParam(event, 'id', '缺少借用记录ID');
  if (typeof id !== 'string') {
    return id;
  }

  try {
    const body = returnSchema.parse(await readBody(event));
    await MetrologyBorrowService.confirmReturn(id, body, userinfo.username);
    return useResponseSuccess(null);
  } catch (error: unknown) {
    logApiError('metrology-borrow-return', error, undefined, event);
    if (error instanceof Error) {
      return badRequestResponse(event, error.message);
    }
    return internalServerErrorResponse(event, '归还量具失败');
  }
});
