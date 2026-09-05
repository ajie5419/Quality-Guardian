import { defineEventHandler } from 'h3';
import { MetricGovernanceService } from '~/modules/metric-governance';
import { getMetricGovernanceActor } from '~/modules/metric-governance/metric-governance-route';
import { requireSystemAdmin } from '~/modules/user/system-auth';
import { logApiError } from '~/utils/api-logger';
import { businessErrorResponse, isBusinessError } from '~/utils/business-error';
import { getCurrentUser } from '~/utils/current-user';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';

export default defineEventHandler(async (event) => {
  const denied = requireSystemAdmin(event, getCurrentUser(event));
  if (denied) return denied;
  getMetricGovernanceActor(event);
  const id = getRequiredRouterParam(
    event,
    'id',
    'Metric definition ID is required',
  );
  if (typeof id !== 'string') return id;
  try {
    return useResponseSuccess(await MetricGovernanceService.getDefinition(id));
  } catch (error) {
    logApiError('metric-governance-detail', error, undefined, event);
    if (isBusinessError(error)) return businessErrorResponse(event, error);
    return internalServerErrorResponse(
      event,
      'Failed to get metric definition',
    );
  }
});
