import { defineEventHandler } from 'h3';
import { PassRateProjectionRolloutService } from '~/modules/report';
import { requireSystemAdmin } from '~/modules/user/system-auth';
import { logApiError } from '~/utils/api-logger';
import { getCurrentUser } from '~/utils/current-user';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const denied = requireSystemAdmin(event, getCurrentUser(event));
  if (denied) return denied;
  try {
    return useResponseSuccess(
      await PassRateProjectionRolloutService.getStatus(),
    );
  } catch (error: unknown) {
    logApiError('pass-rate-projection-status', error, undefined, event);
    return internalServerErrorResponse(
      event,
      'Failed to read pass-rate projection rollout status',
    );
  }
});
