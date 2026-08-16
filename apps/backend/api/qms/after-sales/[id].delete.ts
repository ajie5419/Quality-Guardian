import { PERMISSION_CODES } from '@qgs/shared';
import { defineEventHandler } from 'h3';
import { AfterSalesService } from '~/modules/after-sales/after-sales.service';
import { authorizeWrite } from '~/modules/rbac';
import { logApiError } from '~/utils/api-logger';
import { getCurrentUser } from '~/utils/current-user';
import { isPrismaNotFoundError } from '~/utils/prisma-error';
import {
  internalServerErrorResponse,
  notFoundResponse,
  useResponseSuccess,
} from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';

export default defineEventHandler(async (event) => {
  await authorizeWrite(event, PERMISSION_CODES.QMS.AFTER_SALES.DELETE);
  const userinfo = getCurrentUser(event);

  const id = getRequiredRouterParam(event, 'id', 'Missing ID');
  if (typeof id !== 'string') {
    return id;
  }

  try {
    await AfterSalesService.deleteRecord(id, String(userinfo.id));
    return useResponseSuccess(null);
  } catch (error: unknown) {
    logApiError('after-sales', error, undefined, event);
    if (isPrismaNotFoundError(error)) {
      return notFoundResponse(event, 'After-sales record not found');
    }
    return internalServerErrorResponse(
      event,
      'Failed to delete after-sales record',
    );
  }
});
