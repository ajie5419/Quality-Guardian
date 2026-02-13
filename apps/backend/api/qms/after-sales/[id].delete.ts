import { defineEventHandler } from 'h3';
import { AfterSalesService } from '~/services/after-sales.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import { isPrismaNotFoundError } from '~/utils/prisma-error';
import {
  internalServerErrorResponse,
  notFoundResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  const id = getRequiredRouterParam(event, 'id', 'Missing ID');
  if (typeof id !== 'string') {
    return id;
  }

  try {
    await AfterSalesService.deleteRecord(id, String(userinfo.id));
    return useResponseSuccess(null);
  } catch (error: unknown) {
    logApiError('after-sales', error);
    if (isPrismaNotFoundError(error)) {
      return notFoundResponse(event, 'After-sales record not found');
    }
    return internalServerErrorResponse(
      event,
      'Failed to delete after-sales record',
    );
  }
});
