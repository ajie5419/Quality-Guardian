import {
  passRateProjectionRebuildSchema,
  PassRateProjectionRolloutService,
} from '~/modules/report';
import { requireSystemAdmin } from '~/modules/user/system-auth';
import { logApiError } from '~/utils/api-logger';
import { getCurrentUser } from '~/utils/current-user';
import { defineValidatedHandler } from '~/utils/define-validated-handler';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineValidatedHandler(
  passRateProjectionRebuildSchema,
  async (event, body) => {
    const user = getCurrentUser(event);
    const denied = requireSystemAdmin(event, user);
    if (denied) return denied;
    try {
      return useResponseSuccess(
        await PassRateProjectionRolloutService.requestRebuild({
          reason: body.reason,
          requestedById: String(user.id),
        }),
      );
    } catch (error: unknown) {
      logApiError('pass-rate-projection-rebuild', error, undefined, event);
      return internalServerErrorResponse(
        event,
        'Failed to queue pass-rate projection rebuild',
      );
    }
  },
);
