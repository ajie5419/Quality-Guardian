import { defineEventHandler, readBody } from 'h3';
import { MetrologyBorrowService } from '~/services/metrology-borrow.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  badRequestResponse,
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  const id = getRequiredRouterParam(event, 'id', '缺少借用记录ID');
  if (typeof id !== 'string') {
    return id;
  }

  try {
    const body = await readBody(event);
    await MetrologyBorrowService.confirmReturn(
      id,
      body as Record<string, unknown>,
      userinfo.username,
    );
    return useResponseSuccess(null);
  } catch (error: unknown) {
    logApiError('metrology-borrow-return', error);
    if (error instanceof Error) {
      return badRequestResponse(event, error.message);
    }
    return internalServerErrorResponse(event, '归还量具失败');
  }
});
