import { z } from 'zod';
import { defineValidatedHandler } from '~/core/validation/define-validated-handler';
import { QualityLossService } from '~/services/quality-loss.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import { parseQualityLossCommonQuery } from '~/utils/quality-loss-query';
import {
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineValidatedHandler(
  z.object({}).passthrough(),
  async (event, query) => {
    const userinfo = verifyAccessToken(event);
    if (!userinfo) {
      return unAuthorizedResponse(event);
    }

    const filters = parseQualityLossCommonQuery(query);

    try {
      const result = await QualityLossService.getYearlyCharts({
        ...filters,
        userContext: {
          userId: String(userinfo.id || userinfo.userId || ''),
          username: userinfo.username,
        },
      });
      return useResponseSuccess(result);
    } catch (error) {
      logApiError('quality-loss-charts', error, undefined, event);
      return internalServerErrorResponse(
        event,
        'Failed to fetch quality loss charts',
      );
    }
  },
);
