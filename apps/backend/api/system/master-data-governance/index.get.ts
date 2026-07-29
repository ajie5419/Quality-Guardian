import { getQuery } from 'h3';
import {
  assertMasterDataGovernancePermission,
  MASTER_DATA_GOVERNANCE_LIST_PERMISSION,
  masterDataGovernanceQuerySchema,
  MasterDataGovernanceService,
} from '~/modules/master-data-governance';
import { logApiError } from '~/utils/api-logger';
import { businessErrorResponse, isBusinessError } from '~/utils/business-error';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  try {
    await assertMasterDataGovernancePermission(
      event,
      MASTER_DATA_GOVERNANCE_LIST_PERMISSION,
    );
    const query = masterDataGovernanceQuerySchema.parse(getQuery(event));
    return useResponseSuccess(await MasterDataGovernanceService.list(query));
  } catch (error: unknown) {
    logApiError('master-data-governance-list', error, undefined, event);
    if (isBusinessError(error)) return businessErrorResponse(event, error);
    return internalServerErrorResponse(
      event,
      'Failed to list master data references',
    );
  }
});
