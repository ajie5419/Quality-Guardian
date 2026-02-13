import { defineEventHandler, getRouterParam, setResponseStatus } from 'h3';
import { AfterSalesService } from '~/services/after-sales.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import { isPrismaNotFoundError } from '~/utils/prisma-error';
import {
  unAuthorizedResponse,
  useResponseError,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  const id = getRouterParam(event, 'id');
  if (!id) {
    setResponseStatus(event, 400);
    return useResponseError('Missing ID');
  }

  try {
    await AfterSalesService.deleteRecord(id, String(userinfo.id));
    return useResponseSuccess(null);
  } catch (error: unknown) {
    logApiError('after-sales', error);
    setResponseStatus(event, isPrismaNotFoundError(error) ? 404 : 500);
    return useResponseError(
      isPrismaNotFoundError(error)
        ? 'After-sales record not found'
        : 'Failed to delete after-sales record',
    );
  }
});
