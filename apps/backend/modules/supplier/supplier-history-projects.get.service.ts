import { defineEventHandler } from 'h3';
import { SupplierService } from '~/modules/supplier/supplier.service';
import { logApiError } from '~/utils/api-logger';
import {
  internalServerErrorResponse,
  notFoundResponse,
  useResponseSuccess,
} from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';

export default defineEventHandler(async (event) => {
  const id = getRequiredRouterParam(event, 'id', '缺少供应商ID');
  if (typeof id !== 'string') return id;

  try {
    const projects = await SupplierService.getHistoryProjects(id);
    if (!projects) {
      return notFoundResponse(event, '供应商不存在');
    }
    return useResponseSuccess({ items: projects });
  } catch (error: unknown) {
    logApiError('supplier-history-projects', error, { id }, event);
    return internalServerErrorResponse(
      event,
      'Failed to fetch supplier history projects',
    );
  }
});
