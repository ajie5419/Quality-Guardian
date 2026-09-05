import { defineEventHandler } from 'h3';
import { MetricGovernanceService } from '~/modules/metric-governance';
import { getMetricGovernanceActor } from '~/modules/metric-governance/metric-governance-route';
import { requireSystemAdmin } from '~/modules/user/system-auth';
import { logApiError } from '~/utils/api-logger';
import { getCurrentUser } from '~/utils/current-user';
import {
  internalServerErrorResponse,
  useListResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const denied = requireSystemAdmin(event, getCurrentUser(event));
  if (denied) return denied;
  try {
    // Registry metadata access is separate from metric-value permissions.
    getMetricGovernanceActor(event);
    return useListResponseSuccess(
      await MetricGovernanceService.listDefinitions(),
    );
  } catch (error) {
    logApiError('metric-governance-list', error, undefined, event);
    return internalServerErrorResponse(
      event,
      'Failed to list metric definitions',
    );
  }
});
