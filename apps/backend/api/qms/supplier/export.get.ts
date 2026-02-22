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
    const params = parseSupplierListQuery(query);
    const result = await SupplierService.findAll({
      ...params,
      page: 1,
      pageSize: 1_000_000,
    });

    return useResponseSuccess({
      items: result.items || [],
      total: result.total || 0,
    });
  } catch (error: unknown) {
    logApiError('supplier-export', error);
    return internalServerErrorResponse(event, 'Failed to export suppliers');
  }
});
