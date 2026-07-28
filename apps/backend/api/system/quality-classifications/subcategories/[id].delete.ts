import { getRouterParam } from 'h3';
import {
  assertQualityClassificationPermission,
  QUALITY_CLASSIFICATION_EDIT_PERMISSION,
  qualityClassificationIdSchema,
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
      QUALITY_CLASSIFICATION_EDIT_PERMISSION,
    );
    const id = qualityClassificationIdSchema.parse(getRouterParam(event, 'id'));
    await QualityClassificationService.removeSubcategory(id);
    return useResponseSuccess({ message: 'Subcategory removed' });
  } catch (error: unknown) {
    logApiError(
      'quality-classification-subcategory-delete',
      error,
      undefined,
      event,
    );
    if (isBusinessError(error)) return businessErrorResponse(event, error);
    return internalServerErrorResponse(event, 'Failed to remove subcategory');
  }
});
