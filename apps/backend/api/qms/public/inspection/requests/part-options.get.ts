import {
  partMasterRemoteSearchSchema,
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
  partMasterRemoteSearchSchema,
  async (event, query) => {
    try {
      return useResponseSuccess(await PartMasterService.searchActive(query));
    } catch (error: unknown) {
      logApiError(
        'public-inspection-request-part-options',
        error,
        undefined,
        event,
      );
      if (isBusinessError(error)) return businessErrorResponse(event, error);
      return internalServerErrorResponse(event, 'Failed to load materials');
    }
  },
);
