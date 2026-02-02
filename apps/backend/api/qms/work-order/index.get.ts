import { defineEventHandler, getQuery } from 'h3';
import { WorkOrderService } from '~/services/work-order.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import { unAuthorizedResponse, useResponseSuccess } from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  // 获取分页与过滤参数
  const query = getQuery(event);
  const page = Number.parseInt(String(query.page || 1));
  const pageSize = Number.parseInt(String(query.pageSize || 20));
  const year = query.year ? Number(query.year) : undefined;
  const projectName = query.projectName ? String(query.projectName) : undefined;
  const statusFilter = query.status ? String(query.status) : undefined;
  const workOrderNumber = query.workOrderNumber
    ? String(query.workOrderNumber)
    : undefined;
  const ignoreYearFilter = query.ignoreYearFilter === 'true';
  const keyword = query.keyword ? String(query.keyword) : undefined;

  // Parse ids from query (comma separated)
  const ids = query.ids
    ? String(query.ids).split(',').filter(Boolean)
    : undefined;

  try {
    const result = await WorkOrderService.getList({
      page,
      pageSize,
      year,
      projectName,
      status: statusFilter,
      workOrderNumber,
      ignoreYearFilter,
      keyword,
      ids,
    });

    return useResponseSuccess(result);
  } catch (error) {
    logApiError('work-order', error);
    return useResponseSuccess({ items: [], total: 0, summary: [] });
  }
});
