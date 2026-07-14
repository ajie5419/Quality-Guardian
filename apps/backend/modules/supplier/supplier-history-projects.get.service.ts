import { defineEventHandler, getQuery } from 'h3';
import { z } from 'zod';
import { SupplierService } from '~/modules/supplier/supplier.service';
import { logApiError } from '~/utils/api-logger';
import {
  badRequestResponse,
  internalServerErrorResponse,
  notFoundResponse,
  useResponseSuccess,
} from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';

const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export default defineEventHandler(async (event) => {
  const id = getRequiredRouterParam(event, 'id', '缺少供应商ID');
  if (typeof id !== 'string') return id;

  try {
    const pagination = paginationSchema.safeParse(getQuery(event));
    if (!pagination.success) {
      return badRequestResponse(event, '分页参数无效');
    }
    const projects = await SupplierService.getHistoryProjects(
      id,
      pagination.data,
    );
    if (!projects) {
      return notFoundResponse(event, '供应商不存在');
    }
    return useResponseSuccess(projects);
  } catch (error: unknown) {
    logApiError('supplier-history-projects', error, { id }, event);
    return internalServerErrorResponse(
      event,
      'Failed to fetch supplier history projects',
    );
  }
});
