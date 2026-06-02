import { z } from 'zod';
import { parseAfterSalesListQuery } from '~/modules/after-sales/after-sales-query';
import { AfterSalesService } from '~/modules/after-sales/after-sales.service';
import { logApiError } from '~/utils/api-logger';
import { getCurrentUser } from '~/utils/current-user';
import { defineValidatedHandler } from '~/utils/define-validated-handler';
import {
  internalServerErrorResponse,
  usePageResponseSuccess,
} from '~/utils/response';

const afterSalesListQuerySchema = z.object({}).passthrough();

function normalizePageValue(value: unknown, fallback: number) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export default defineValidatedHandler(
  afterSalesListQuerySchema,
  async (event, query) => {
    const userinfo = getCurrentUser(event);

    const params = parseAfterSalesListQuery(query);
    const page = normalizePageValue(query.page, 1);
    const pageSize = Math.min(normalizePageValue(query.pageSize, 20), 100);

    try {
      const list = await AfterSalesService.getList({
        ...params,
        userContext: {
          userId: String(userinfo.id || userinfo.userId || ''),
          username: userinfo.username,
        },
        dataScope: event.context.dataScope,
      });
      return usePageResponseSuccess(page, pageSize, list);
    } catch (error: unknown) {
      logApiError('after-sales', error, undefined, event);
      return internalServerErrorResponse(
        event,
        'Failed to fetch after-sales list',
      );
    }
  },
);
