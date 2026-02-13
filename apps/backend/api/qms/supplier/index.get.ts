import { defineEventHandler, getQuery } from 'h3';
import { SupplierService } from '~/services/supplier.service';
import { logApiError } from '~/utils/api-logger';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';
import { parseSupplierListQuery } from '~/utils/supplier';

export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event) as Record<string, unknown>;
    const result = await SupplierService.findAll(parseSupplierListQuery(query));

    return useResponseSuccess(result);
  } catch (error: unknown) {
    logApiError('supplier', error);
    return internalServerErrorResponse(event, 'Failed to fetch suppliers');
  }
});
