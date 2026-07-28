import { getQuery } from 'h3';
import {
  assertQualityClassificationPermission,
  QUALITY_CLASSIFICATION_LIST_PERMISSION,
  qualityClassificationQuerySchema,
  QualityClassificationService,
} from '~/modules/quality-classification';
import { logApiError } from '~/utils/api-logger';
import { businessErrorResponse, isBusinessError } from '~/utils/business-error';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  try {
    await assertQualityClassificationPermission(
      event,
      QUALITY_CLASSIFICATION_LIST_PERMISSION,
    );
    const { scope } = qualityClassificationQuerySchema.parse(getQuery(event));
    return useResponseSuccess(
      await QualityClassificationService.listForManagement(scope),
    );
  } catch (error: unknown) {
    logApiError('quality-classification-list', error, undefined, event);
    if (isBusinessError(error)) return businessErrorResponse(event, error);
    return internalServerErrorResponse(
      event,
      'Failed to list quality classifications',
    );
  }
});
