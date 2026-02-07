import { defineEventHandler, getQuery } from 'h3';
import { SupplierService } from '~/services/supplier.service';
import { logApiError } from '~/utils/api-logger';
import { useResponseSuccess } from '~/utils/response';

export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event);

    // 1. 规范化参数 (防御所有非法输入)
    const getSafe = (val: unknown): string | undefined => {
      const s = String(Array.isArray(val) ? val[0] : (val ?? '')).trim();
      if (!s || s === 'undefined' || s === 'null' || s === '[object Object]')
        return undefined;
      return s;
    };

    const page = Math.max(1, Number.parseInt(String(query.page || '1')) || 1);
    const pageSize = Math.max(
      1,
      Number.parseInt(String(query.pageSize || '20')) || 20,
    );
    const category = getSafe(query.category);
    const statusFilter = getSafe(query.status);
    const keyword = getSafe(query.keyword) || getSafe(query.name);
    const sortBy = getSafe(query.sortBy);
    const sortOrder = getSafe(query.sortOrder) as 'asc' | 'desc' | undefined;

    const result = await SupplierService.findAll({
      page,
      pageSize,
      category,
      status: statusFilter,
      keyword,
      sortBy,
      sortOrder,
    });

    return useResponseSuccess(result);
  } catch (error: unknown) {
    logApiError('supplier', error);
    return useResponseSuccess({ items: [], total: 0, stats: { total: 0 } });
  }
});
