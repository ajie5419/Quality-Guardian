import { getRouterParam } from 'h3';
import {
  assertMasterDataGovernancePermission,
  MASTER_DATA_GOVERNANCE_EDIT_PERMISSION,
  masterDataGovernanceResolutionSchema,
  MasterDataGovernanceService,
} from '~/modules/master-data-governance';
import { logApiError } from '~/utils/api-logger';
import { businessErrorResponse, isBusinessError } from '~/utils/business-error';
import { defineValidatedHandler } from '~/utils/define-validated-handler';
import {
  badRequestResponse,
  internalServerErrorResponse as errorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineValidatedHandler(
  masterDataGovernanceResolutionSchema,
  async (event, body) => {
    try {
      await assertMasterDataGovernancePermission(
        event,
        MASTER_DATA_GOVERNANCE_EDIT_PERMISSION,
      );
      const auditId = String(getRouterParam(event, 'id') || '').trim();
      if (!auditId) return badRequestResponse(event, 'Missing audit ID');
      return useResponseSuccess(
        await MasterDataGovernanceService.resolveRequest(auditId, body),
      );
    } catch (error: unknown) {
      logApiError('master-data-governance-resolve', error, undefined, event);
      if (isBusinessError(error)) return businessErrorResponse(event, error);
      return errorResponse(event, 'Master data resolution failed');
    }
  },
);
