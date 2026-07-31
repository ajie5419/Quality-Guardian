import { getRouterParam } from 'h3';
import {
  assertMasterDataGovernancePermission,
  MASTER_DATA_GOVERNANCE_LIST_PERMISSION,
  masterDataGovernanceOptionsQuerySchema,
  MasterDataGovernanceService,
} from '~/modules/master-data-governance';
import { logApiError } from '~/utils/api-logger';
import { businessErrorResponse, isBusinessError } from '~/utils/business-error';
import { defineValidatedHandler } from '~/utils/define-validated-handler';
import {
  badRequestResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineValidatedHandler(
  masterDataGovernanceOptionsQuerySchema,
  async (event, query) => {
    try {
      await assertMasterDataGovernancePermission(
        event,
        MASTER_DATA_GOVERNANCE_LIST_PERMISSION,
      );
      const auditId = String(getRouterParam(event, 'id') || '').trim();
      if (!auditId) return badRequestResponse(event, 'Missing audit ID');
      return useResponseSuccess(
        await MasterDataGovernanceService.listOptions(auditId, query.keyword),
      );
    } catch (error: unknown) {
      logApiError('master-data-governance-options', error, undefined, event);
      if (isBusinessError(error)) return businessErrorResponse(event, error);
      return internalServerErrorResponse(event, 'Master data options failed');
    }
  },
);
