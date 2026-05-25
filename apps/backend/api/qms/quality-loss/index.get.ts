import { z } from 'zod';
import { defineValidatedHandler } from '~/utils/define-validated-handler';
import { QualityLossService } from '~/services/quality-loss.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import { parseQualityLossListQuery } from '~/utils/quality-loss-query';
import {
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';

const qualityLossListQuerySchema = z.object({}).passthrough();

export default defineValidatedHandler(
  qualityLossListQuerySchema,
  async (event, query) => {
    const userinfo = await verifyAccessToken(event);
    if (!userinfo) {
      return unAuthorizedResponse(event);
    }

    const params = parseQualityLossListQuery(query);

    try {
      const result = await QualityLossService.getAllLosses({
        ...params,
        userContext: {
          userId: String(userinfo.id || userinfo.userId || ''),
          username: userinfo.username,
        },
      });
      return useResponseSuccess(result);
    } catch (error: unknown) {
      logApiError('quality-loss', error, undefined, event);
      return internalServerErrorResponse(
        event,
        'Failed to fetch quality loss list',
      );
    }
  },
);
