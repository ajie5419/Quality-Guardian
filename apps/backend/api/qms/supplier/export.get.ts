import { defineEventHandler, getQuery } from 'h3';
import { SupplierService } from '~/services/supplier.service';
import { logApiDebug, logApiError, logApiWarn } from '~/utils/api-logger';
import {
  badRequestResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';
import { parseSupplierListQuery } from '~/utils/supplier';

const MAX_EXPORT_ROWS = 20_000;

export default defineEventHandler(async (event) => {
  const startedAt = Date.now();
  try {
    const query = getQuery(event) as Record<string, unknown>;
    const params = parseSupplierListQuery(query);
    const result = await SupplierService.findAll({
      ...params,
      page: 1,
      pageSize: MAX_EXPORT_ROWS + 1,
    });

    if ((result.total || 0) > MAX_EXPORT_ROWS) {
      logApiWarn('supplier-export', 'export rows exceed limit', {
        count: result.total,
        filters: params,
        latencyMs: Date.now() - startedAt,
        module: 'supplier',
      });
      return badRequestResponse(
        event,
        `导出数据量超过上限（${MAX_EXPORT_ROWS} 条），请缩小筛选范围后重试`,
      );
    }

    logApiDebug('supplier-export', 'export success', {
      count: result.total || 0,
      filters: params,
      latencyMs: Date.now() - startedAt,
      module: 'supplier',
    });

    return useResponseSuccess({
      items: result.items || [],
      total: result.total || 0,
    });
  } catch (error: unknown) {
    logApiError('supplier-export', error, {
      latencyMs: Date.now() - startedAt,
      module: 'supplier',
    });
    return internalServerErrorResponse(event, 'Failed to export suppliers');
  }
});
