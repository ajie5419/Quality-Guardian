import {
  inspectionRecordListQuerySchema,
  parseInspectionRecordListQuery,
} from '~/modules/inspection/inspection-record';
import { InspectionService } from '~/modules/inspection/inspection.service';
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

export default defineValidatedHandler(
  inspectionRecordListQuerySchema,
  async (event, query) => {
    const startedAt = Date.now();
    try {
      const userinfo = getCurrentUser(event);
      const scope = event.context.dataScope;
      const params = parseInspectionRecordListQuery(query);
      const result = await InspectionService.findAllForExport(
        {
          ...params,
        },
        scope && userinfo
          ? { scope, user: { id: userinfo.id, username: userinfo.username } }
          : undefined,
      );

      if (isExportLimitExceeded(result.items)) {
        logApiWarn('inspection-records-export', 'export rows exceed limit', {
          count: result.total,
          filters: params,
          latencyMs: Date.now() - startedAt,
          module: 'inspection-records',
        });
        return badRequestResponse(
          event,
          EXPORT_LIMIT_EXCEEDED_MESSAGE,
          exportLimitExceededError(),
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
      logApiError(
        'inspection-records-export',
        error,
        {
          latencyMs: Date.now() - startedAt,
          module: 'inspection-records',
        },
        event,
      );
      return internalServerErrorResponse(
        event,
        'Failed to export inspection records',
      );
    }
  },
);
