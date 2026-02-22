import { defineEventHandler, getQuery } from 'h3';
import { WorkOrderService } from '~/services/work-order.service';
import { logApiDebug, logApiError, logApiWarn } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  badRequestResponse,
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';
import { parseWorkOrderListQuery } from '~/utils/work-order';

const MAX_EXPORT_ROWS = 20_000;

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  const startedAt = Date.now();
  const query = getQuery(event) as Record<string, unknown>;
  const params = parseWorkOrderListQuery(query);

  try {
    const result = await WorkOrderService.getList({
      ...params,
      page: 1,
      pageSize: MAX_EXPORT_ROWS + 1,
    });

    if ((result.total || 0) > MAX_EXPORT_ROWS) {
      logApiWarn('work-order-export', 'export rows exceed limit', {
        count: result.total,
        filters: params,
        latencyMs: Date.now() - startedAt,
        module: 'work-order',
        userId: userinfo.userId,
      });
      return badRequestResponse(
        event,
        `导出数据量超过上限（${MAX_EXPORT_ROWS} 条），请缩小筛选范围后重试`,
      );
    }

    logApiDebug('work-order-export', 'export success', {
      count: result.total || 0,
      filters: params,
      latencyMs: Date.now() - startedAt,
      module: 'work-order',
      userId: userinfo.userId,
    });

    return useResponseSuccess({
      items: result.items || [],
      total: result.total || 0,
    });
  } catch (error) {
    logApiError('work-order-export', error, {
      latencyMs: Date.now() - startedAt,
      module: 'work-order',
      userId: userinfo.userId,
    });
    return internalServerErrorResponse(
      event,
      'Failed to export work order list',
    );
  }
});
