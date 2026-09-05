import { defineEventHandler, getQuery } from 'h3';
import { AfterSalesService } from '~/modules/after-sales/after-sales.service';
import { logApiError } from '~/utils/api-logger';
import { businessErrorResponse, isBusinessError } from '~/utils/business-error';
import { getCurrentUser } from '~/utils/current-user';
import { requireExpectedVersionQuery } from '~/utils/optimistic-lock';
import { isPrismaNotFoundError } from '~/utils/prisma-error';
import {
  internalServerErrorResponse,
  notFoundResponse,
  useResponseSuccess,
} from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';

export default defineEventHandler(async (event) => {
  const userinfo = getCurrentUser(event);

  const id = getRequiredRouterParam(event, 'id', 'Missing ID');
  if (typeof id !== 'string') {
    return id;
  }

  try {
    // OPTIMISTIC-LOCK-001: user deletes carry the version the client read.
    const expectedVersion = requireExpectedVersionQuery(getQuery(event));
    await AfterSalesService.deleteRecord(
      id,
      String(userinfo.id ?? userinfo.userId ?? ''),
      event.context.dataScope,
      expectedVersion,
    );
    return useResponseSuccess(null);
  } catch (error: unknown) {
    logApiError('after-sales', error, undefined, event);
    if (isBusinessError(error)) return businessErrorResponse(event, error);
    if (isPrismaNotFoundError(error)) {
      return notFoundResponse(event, 'After-sales record not found');
    }
    return internalServerErrorResponse(
      event,
      'Failed to delete after-sales record',
    );
  }
});
