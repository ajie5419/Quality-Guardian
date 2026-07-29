import {
  assertQualityClassificationPermission,
  QUALITY_CLASSIFICATION_EDIT_PERMISSION,
  qualityClassificationCategoryCreateSchema,
  QualityClassificationService,
} from '~/modules/quality-classification';
import { logApiError } from '~/utils/api-logger';
import { businessErrorResponse, isBusinessError } from '~/utils/business-error';
import { defineValidatedHandler } from '~/utils/define-validated-handler';
import { isPrismaUniqueConflictError } from '~/utils/prisma-error';
import {
  conflictResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineValidatedHandler(
  qualityClassificationCategoryCreateSchema,
  async (event, body) => {
    try {
      await assertQualityClassificationPermission(
        event,
        QUALITY_CLASSIFICATION_EDIT_PERMISSION,
      );
      return useResponseSuccess(
        await QualityClassificationService.createCategory(body),
      );
    } catch (error: unknown) {
      logApiError(
        'quality-classification-category-create',
        error,
        undefined,
        event,
      );
      if (isBusinessError(error)) return businessErrorResponse(event, error);
      if (isPrismaUniqueConflictError(error)) {
        return conflictResponse(event, 'Category code or name already exists');
      }
      return internalServerErrorResponse(event, 'Failed to create category');
    }
  },
);
