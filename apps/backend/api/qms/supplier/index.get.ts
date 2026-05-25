import { z } from 'zod';
import { defineValidatedHandler } from '~/core/validation/define-validated-handler';
import { SupplierService } from '~/services/supplier.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';
import { parseSupplierListQuery } from '~/utils/supplier';

const supplierListQuerySchema = z.object({}).passthrough();

export default defineValidatedHandler(
  supplierListQuerySchema,
  async (event, query) => {
    const userinfo = await verifyAccessToken(event);
    if (!userinfo) {
      return unAuthorizedResponse(event);
    }

    try {
      const result = await SupplierService.findAll({
        ...parseSupplierListQuery(query),
        userContext: {
          userId: String(userinfo.id || userinfo.userId || ''),
          username: userinfo.username,
        },
      });

      return useResponseSuccess(result);
    } catch (error: unknown) {
      logApiError('supplier', error, undefined, event);
      return internalServerErrorResponse(event, 'Failed to fetch suppliers');
    }
  },
);
