import { z } from 'zod';
import { defineValidatedHandler } from '~/utils/define-validated-handler';
import { AfterSalesService } from '~/services/after-sales.service';
import { parseAfterSalesListQuery } from '~/utils/after-sales-query';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  internalServerErrorResponse,
  unAuthorizedResponse,
  useListResponseSuccess,
} from '~/utils/response';

const afterSalesListQuerySchema = z.object({}).passthrough();

export default defineValidatedHandler(
  afterSalesListQuerySchema,
  async (event, query) => {
    const userinfo = await verifyAccessToken(event);
    if (!userinfo) {
      return unAuthorizedResponse(event);
    }

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
