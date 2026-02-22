import { defineEventHandler, getQuery } from 'h3';
import { InspectionService } from '~/services/inspection.service';
import { logApiDebug, logApiError, logApiWarn } from '~/utils/api-logger';
import { parseInspectionRecordListQuery } from '~/utils/inspection-record';
import {
  badRequestResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

const MAX_EXPORT_ROWS = 20_000;

export default defineEventHandler(async (event) => {
  const startedAt = Date.now();
  try {
    const query = getQuery(event) as Record<string, unknown>;
    const params = parseInspectionRecordListQuery(query);
    const result = await InspectionService.findAll({
      ...params,
      forExport: true,
    });

    if ((result.total || 0) > MAX_EXPORT_ROWS) {
      logApiWarn('inspection-records-export', 'export rows exceed limit', {
        count: result.total,
        filters: params,
        latencyMs: Date.now() - startedAt,
        module: 'inspection-records',
      });
      return badRequestResponse(
        event,
        `导出数据量超过上限（${MAX_EXPORT_ROWS} 条），请缩小筛选范围后重试`,
      );
    }

    logApiDebug('inspection-records-export', 'export success', {
      count: result.total || 0,
      filters: params,
      latencyMs: Date.now() - startedAt,
      module: 'inspection-records',
    });

    return useResponseSuccess(result);
  } catch (error: unknown) {
    logApiError('inspection-records-export', error, {
      latencyMs: Date.now() - startedAt,
      module: 'inspection-records',
    });
    return internalServerErrorResponse(
      event,
      'Failed to export inspection records',
    );
  }
});
