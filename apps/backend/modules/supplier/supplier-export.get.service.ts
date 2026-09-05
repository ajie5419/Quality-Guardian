import { z } from 'zod';
import { parseSupplierListQuery } from '~/modules/supplier/supplier-query';
import { SupplierService } from '~/modules/supplier/supplier.service';
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

const querySchema = z.object({}).passthrough();

export default defineValidatedHandler(querySchema, async (event, query) => {
  const startedAt = Date.now();
  try {
    const userinfo = getCurrentUser(event);
    const params = parseSupplierListQuery(query);
    const result = await SupplierService.findAllForExport({
      ...params,
      dataScope: event.context.dataScope,
      userContext: {
        userId: String(userinfo.id ?? userinfo.userId ?? ''),
        username: userinfo.username,
      },
    });

    if (isExportLimitExceeded(result.items)) {
      logApiWarn('supplier-export', 'export rows exceed limit', {
        count: result.total,
        filters: params,
        latencyMs: Date.now() - startedAt,
        module: 'supplier',
      });
      return badRequestResponse(
        event,
        EXPORT_LIMIT_EXCEEDED_MESSAGE,
        exportLimitExceededError(),
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
    logApiError(
      'supplier-export',
      error,
      { latencyMs: Date.now() - startedAt, module: 'supplier' },
      event,
    );
    return internalServerErrorResponse(event, 'Failed to export suppliers');
  }
});
