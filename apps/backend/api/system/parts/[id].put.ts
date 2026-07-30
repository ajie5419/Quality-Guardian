import { getRouterParam } from 'h3';
import {
  assertPartMasterPermission,
  PART_MASTER_EDIT_PERMISSION,
  partMasterIdSchema,
  PartMasterService,
  partMasterUpdateSchema,
} from '~/modules/part-master';
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
  partMasterUpdateSchema,
  async (event, body) => {
    try {
      await assertPartMasterPermission(event, PART_MASTER_EDIT_PERMISSION);
      const id = partMasterIdSchema.parse(getRouterParam(event, 'id'));
      return useResponseSuccess(await PartMasterService.update(id, body));
    } catch (error: unknown) {
      logApiError('part-master-update', error, undefined, event);
      if (isBusinessError(error)) return businessErrorResponse(event, error);
      if (isPrismaUniqueConflictError(error)) {
        return conflictResponse(event, 'Material name already exists');
      }
      return internalServerErrorResponse(event, 'Failed to update material');
    }
  },
);
