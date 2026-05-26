import { z } from 'zod';
import { parseQualityLossCommonQuery } from '~/modules/quality-loss/quality-loss-query';
import { QualityLossService } from '~/modules/quality-loss/quality-loss.service';
import { logApiDebug, logApiError, logApiWarn } from '~/utils/api-logger';
import { defineValidatedHandler } from '~/utils/define-validated-handler';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  badRequestResponse,
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';

const MAX_EXPORT_ROWS = 20_000;
const qualityLossExportQuerySchema = z.object({}).passthrough();

export default defineValidatedHandler(
  qualityLossExportQuerySchema,
  async (event, query) => {
    const userinfo = verifyAccessToken(event);
    if (!userinfo) {
      return unAuthorizedResponse(event);
    }

    const startedAt = Date.now();
    const filters = parseQualityLossCommonQuery(query);

    try {
      const items = await QualityLossService.getLossSummary(filters);

      if (items.length > MAX_EXPORT_ROWS) {
        logApiWarn('quality-loss-export', 'export rows exceed limit', {
          count: items.length,
          filters,
          latencyMs: Date.now() - startedAt,
          module: 'quality-loss',
          userId: userinfo.userId,
        });
        return badRequestResponse(
          event,
          `导出数据量超过上限（${MAX_EXPORT_ROWS} 条），请缩小筛选范围后重试`,
        );
      }

      logApiDebug('quality-loss-export', 'export success', {
        count: items.length,
        filters,
        latencyMs: Date.now() - startedAt,
        module: 'quality-loss',
        userId: userinfo.userId,
      });

      return useResponseSuccess({
        items,
        total: items.length,
      });
    } catch (error: unknown) {
      logApiError(
        'quality-loss-export',
        error,
        {
          latencyMs: Date.now() - startedAt,
          module: 'quality-loss',
          userId: userinfo.userId,
        },
        event,
      );
      return internalServerErrorResponse(
        event,
        'Failed to export quality loss data',
      );
    }
  },
);
