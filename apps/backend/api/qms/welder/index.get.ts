import { z } from 'zod';
import { defineValidatedHandler } from '~/core/validation/define-validated-handler';
import { WelderScoreService } from '~/services/welder-score.service';
import { WelderService } from '~/services/welder.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';
import { parseWelderListQuery } from '~/utils/welder';

const welderListQuerySchema = z.object({}).passthrough();

export default defineValidatedHandler(
  welderListQuerySchema,
  async (event, query) => {
    const userinfo = await verifyAccessToken(event);
    if (!userinfo) {
      return unAuthorizedResponse(event);
    }

    try {
      await WelderScoreService.syncFromInspectionIssues();
      const result = await WelderService.findAll(parseWelderListQuery(query));
      return useResponseSuccess(result);
    } catch (error: unknown) {
      logApiError('welder', error, undefined, event);
      return internalServerErrorResponse(event, 'Failed to fetch welders');
    }
  },
);
