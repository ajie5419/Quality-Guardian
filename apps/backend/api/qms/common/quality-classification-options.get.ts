import { getQuery } from 'h3';
import {
  qualityClassificationQuerySchema,
  QualityClassificationService,
} from '~/modules/quality-classification';
import { logApiError } from '~/utils/api-logger';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  try {
    const { scope } = qualityClassificationQuerySchema.parse(getQuery(event));
    return useResponseSuccess(
      await QualityClassificationService.listActiveTree(scope),
    );
  } catch (error: unknown) {
    logApiError('quality-classification-options', error, undefined, event);
    return internalServerErrorResponse(
      event,
      'Failed to load quality classification options',
    );
  }
});
