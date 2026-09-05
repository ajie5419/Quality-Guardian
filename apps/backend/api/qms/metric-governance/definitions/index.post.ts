import type { CreateMetricDefinitionInput } from '~/modules/metric-governance/metric-governance.types';

import { defineEventHandler, readBody } from 'h3';
import { MetricGovernanceService } from '~/modules/metric-governance';
import { getMetricGovernanceActor } from '~/modules/metric-governance/metric-governance-route';
import { createMetricDefinitionSchema } from '~/modules/metric-governance/metric-governance.schema';
import { requireSystemAdmin } from '~/modules/user/system-auth';
import { logApiError } from '~/utils/api-logger';
import { businessErrorResponse, isBusinessError } from '~/utils/business-error';
import { getCurrentUser } from '~/utils/current-user';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const denied = requireSystemAdmin(event, getCurrentUser(event));
  if (denied) return denied;
  try {
    const body = createMetricDefinitionSchema.parse(await readBody(event));
    return useResponseSuccess(
      await MetricGovernanceService.createDefinition(
        body as CreateMetricDefinitionInput,
        getMetricGovernanceActor(event),
      ),
    );
  } catch (error) {
    logApiError('metric-governance-create', error, undefined, event);
    if (isBusinessError(error)) return businessErrorResponse(event, error);
    return internalServerErrorResponse(
      event,
      'Failed to create metric definition',
    );
  }
});
