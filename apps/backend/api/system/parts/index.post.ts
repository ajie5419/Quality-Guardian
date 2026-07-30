import {
  assertPartMasterPermission,
  PART_MASTER_EDIT_PERMISSION,
  partMasterCreateSchema,
  PartMasterService,
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
  partMasterCreateSchema,
  async (event, body) => {
    try {
      await assertPartMasterPermission(event, PART_MASTER_EDIT_PERMISSION);
      return useResponseSuccess(await PartMasterService.create(body));
    } catch (error: unknown) {
      logApiError('part-master-create', error, undefined, event);
      if (isBusinessError(error)) return businessErrorResponse(event, error);
      if (isPrismaUniqueConflictError(error)) {
        return conflictResponse(event, 'Material name already exists');
      }
      return internalServerErrorResponse(event, 'Failed to create material');
    }
  },
);
