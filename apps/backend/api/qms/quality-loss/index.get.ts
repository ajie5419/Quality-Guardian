import { z } from 'zod';
import { parseQualityLossListQuery } from '~/modules/quality-loss/quality-loss-query';
import { QualityLossService } from '~/modules/quality-loss/quality-loss.service';
import { logApiError } from '~/utils/api-logger';
import { getCurrentUser } from '~/utils/current-user';
import { defineValidatedHandler } from '~/utils/define-validated-handler';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

const qualityLossListQuerySchema = z.object({}).passthrough();

export default defineValidatedHandler(
  qualityLossListQuerySchema,
  async (event, query) => {
    const userinfo = getCurrentUser(event);

    const params = parseQualityLossListQuery(query);

    try {
      const result = await QualityLossService.getAllLosses({
        ...params,
        dataScope: event.context.dataScope,
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
