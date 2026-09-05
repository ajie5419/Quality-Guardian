import { z } from 'zod';
import { parseQualityLossCommonQuery } from '~/modules/quality-loss/quality-loss-query';
import { QualityLossService } from '~/modules/quality-loss/quality-loss.service';
import { logApiDebug, logApiError, logApiWarn } from '~/utils/api-logger';
import { getCurrentUser } from '~/utils/current-user';
import { defineValidatedHandler } from '~/utils/define-validated-handler';
import {
  EXPORT_LIMIT_EXCEEDED_MESSAGE,
  exportLimitExceededError,
  isExportLimitExceeded,
} from '~/utils/export-constants';
import {
  badRequestResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

const qualityLossExportQuerySchema = z.object({}).passthrough();

export default defineValidatedHandler(
  qualityLossExportQuerySchema,
  async (event, query) => {
    const userinfo = getCurrentUser(event);

    const startedAt = Date.now();
    const filters = parseQualityLossCommonQuery(query);

    try {
      const items = await QualityLossService.getExportRows({
        ...filters,
        dataScope: event.context.dataScope,
        userContext: {
          userId: String(userinfo.id || userinfo.userId || ''),
          username: userinfo.username,
        },
      });

      if (isExportLimitExceeded(items)) {
        logApiWarn('quality-loss-export', 'export rows exceed limit', {
          count: items.length,
          filters,
          latencyMs: Date.now() - startedAt,
          module: 'quality-loss',
          userId: userinfo.userId,
        });
        return badRequestResponse(
          event,
          EXPORT_LIMIT_EXCEEDED_MESSAGE,
          exportLimitExceededError(),
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
