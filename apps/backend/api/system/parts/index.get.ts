import {
  assertPartMasterPermission,
  PART_MASTER_LIST_PERMISSION,
  partMasterManagementQuerySchema,
  PartMasterService,
} from '~/modules/part-master';
import { logApiError } from '~/utils/api-logger';
import { businessErrorResponse, isBusinessError } from '~/utils/business-error';
import { defineValidatedHandler } from '~/utils/define-validated-handler';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineValidatedHandler(
  partMasterManagementQuerySchema,
  async (event, query) => {
    try {
      await assertPartMasterPermission(event, PART_MASTER_LIST_PERMISSION);
      return useResponseSuccess(
        await PartMasterService.listForManagement(query),
      );
    } catch (error: unknown) {
      logApiError('part-master-list', error, undefined, event);
      if (isBusinessError(error)) return businessErrorResponse(event, error);
      return internalServerErrorResponse(event, 'Failed to list materials');
    }
  },
);
