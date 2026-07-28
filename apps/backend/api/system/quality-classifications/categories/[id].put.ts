import { getRouterParam } from 'h3';
import {
  assertQualityClassificationPermission,
  QUALITY_CLASSIFICATION_EDIT_PERMISSION,
  qualityClassificationCategoryUpdateSchema,
  qualityClassificationIdSchema,
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
  qualityClassificationCategoryUpdateSchema,
  async (event, body) => {
    try {
      await assertQualityClassificationPermission(
        event,
        QUALITY_CLASSIFICATION_EDIT_PERMISSION,
      );
      const id = qualityClassificationIdSchema.parse(
        getRouterParam(event, 'id'),
      );
      return useResponseSuccess(
        await QualityClassificationService.updateCategory(id, body),
      );
    } catch (error: unknown) {
      logApiError(
        'quality-classification-category-update',
        error,
        undefined,
        event,
      );
      if (isBusinessError(error)) return businessErrorResponse(event, error);
      if (isPrismaUniqueConflictError(error)) {
        return conflictResponse(event, 'Category name already exists');
      }
      return internalServerErrorResponse(event, 'Failed to update category');
    }
  },
);
