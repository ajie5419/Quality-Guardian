import { z } from 'zod';
import { parseWelderListQuery } from '~/modules/welder/welder';
import { WelderScoreService } from '~/modules/welder/welder-score.service';
import { WelderService } from '~/modules/welder/welder.service';
import { logApiError } from '~/utils/api-logger';
import { defineValidatedHandler } from '~/utils/define-validated-handler';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

const welderListQuerySchema = z.object({}).passthrough();

export default defineValidatedHandler(
  welderListQuerySchema,
  async (event, query) => {
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
