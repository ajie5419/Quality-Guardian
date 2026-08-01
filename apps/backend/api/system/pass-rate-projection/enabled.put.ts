import {
  PassRateProjectionRolloutService,
  passRateProjectionToggleSchema,
} from '~/modules/report';
import { requireSystemAdmin } from '~/modules/user/system-auth';
import { logApiError } from '~/utils/api-logger';
import { businessErrorResponse, isBusinessError } from '~/utils/business-error';
import { getCurrentUser } from '~/utils/current-user';
import { defineValidatedHandler } from '~/utils/define-validated-handler';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineValidatedHandler(
  passRateProjectionToggleSchema,
  async (event, body) => {
    const denied = requireSystemAdmin(event, getCurrentUser(event));
    if (denied) return denied;
    try {
      return useResponseSuccess(
        await PassRateProjectionRolloutService.setEnabled(body.enabled),
      );
    } catch (error: unknown) {
      logApiError('pass-rate-projection-toggle', error, undefined, event);
      if (isBusinessError(error)) return businessErrorResponse(event, error);
      return internalServerErrorResponse(
        event,
        'Failed to change pass-rate projection rollout',
      );
    }
  },
);
