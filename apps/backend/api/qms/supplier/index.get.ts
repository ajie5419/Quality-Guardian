import { defineEventHandler, getQuery } from 'h3';
import { SupplierService } from '~/services/supplier.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';
import { parseSupplierListQuery } from '~/utils/supplier';

export default defineEventHandler(async (event) => {
  const userinfo = await verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  try {
    const query = getQuery(event) as Record<string, unknown>;
    const result = await SupplierService.findAll({
      ...parseSupplierListQuery(query),
      userContext: {
        userId: String(userinfo.id || userinfo.userId || ''),
        username: userinfo.username,
      },
    });

    return useResponseSuccess(result);
  } catch (error: unknown) {
    logApiError('supplier', error);
    return internalServerErrorResponse(event, 'Failed to fetch suppliers');
  }
});
