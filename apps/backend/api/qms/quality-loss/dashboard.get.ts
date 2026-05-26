import { z } from 'zod';
import { parseQualityLossCommonQuery } from '~/modules/quality-loss/quality-loss-query';
import { QualityLossService } from '~/modules/quality-loss/quality-loss.service';
import { logApiError } from '~/utils/api-logger';
import { getCurrentUser } from '~/utils/current-user';
import { defineValidatedHandler } from '~/utils/define-validated-handler';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineValidatedHandler(
  z.object({}).passthrough(),
  async (event, query) => {
    const userinfo = getCurrentUser(event);

    const filters = parseQualityLossCommonQuery(query);

    try {
      const result = await QualityLossService.getDashboardSummary({
        ...filters,
        userContext: {
          userId: String(userinfo.id || userinfo.userId || ''),
          username: userinfo.username,
        },
      });
      return useResponseSuccess(result);
    } catch (error) {
      logApiError('quality-loss-dashboard', error, undefined, event);
      return internalServerErrorResponse(
        event,
        'Failed to fetch quality loss dashboard summary',
      );
    }
  },
);
