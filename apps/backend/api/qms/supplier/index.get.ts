import { z } from 'zod';
import { parseSupplierListQuery } from '~/modules/supplier/supplier-query';
import { SupplierService } from '~/modules/supplier/supplier.service';
import { logApiError } from '~/utils/api-logger';
import { getCurrentUser } from '~/utils/current-user';
import { defineValidatedHandler } from '~/utils/define-validated-handler';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

const supplierListQuerySchema = z.object({}).passthrough();

export default defineValidatedHandler(
  supplierListQuerySchema,
  async (event, query) => {
    const userinfo = getCurrentUser(event);

    try {
      const result = await SupplierService.findAll({
        ...parseSupplierListQuery(query),
        userContext: {
          userId: String(userinfo.id || userinfo.userId || ''),
          username: userinfo.username,
        },
        dataScope: event.context.dataScope,
      });

      return useResponseSuccess(result);
    } catch (error: unknown) {
      logApiError('supplier', error, undefined, event);
      return internalServerErrorResponse(event, 'Failed to fetch suppliers');
    }
  },
);
