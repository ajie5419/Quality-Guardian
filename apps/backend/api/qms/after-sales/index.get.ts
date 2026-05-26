import { z } from 'zod';
import { parseAfterSalesListQuery } from '~/modules/after-sales/after-sales-query';
import { AfterSalesService } from '~/modules/after-sales/after-sales.service';
import { logApiError } from '~/utils/api-logger';
import { getCurrentUser } from '~/utils/current-user';
import { defineValidatedHandler } from '~/utils/define-validated-handler';
import {
  internalServerErrorResponse,
  useListResponseSuccess,
} from '~/utils/response';

const afterSalesListQuerySchema = z.object({}).passthrough();

export default defineValidatedHandler(
  afterSalesListQuerySchema,
  async (event, query) => {
    const userinfo = getCurrentUser(event);

    const params = parseAfterSalesListQuery(query);

    try {
      const list = await AfterSalesService.getList({
        ...params,
        userContext: {
          userId: String(userinfo.id || userinfo.userId || ''),
          username: userinfo.username,
        },
      });
      return useListResponseSuccess(list);
    } catch (error: unknown) {
      logApiError('after-sales', error, undefined, event);
      return internalServerErrorResponse(
        event,
        'Failed to fetch after-sales list',
      );
    }
  },
);
