import { defineEventHandler, getQuery, setResponseStatus } from 'h3';
import { SupplierService } from '~/services/supplier.service';
import { logApiError } from '~/utils/api-logger';
import { useResponseError, useResponseSuccess } from '~/utils/response';
import { parseSupplierListQuery } from '~/utils/supplier';

export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event) as Record<string, unknown>;
    const result = await SupplierService.findAll(parseSupplierListQuery(query));

    return useResponseSuccess(result);
  } catch (error: unknown) {
    logApiError('supplier', error);
    setResponseStatus(event, 500);
    return useResponseError('Failed to fetch suppliers');
  }
});
