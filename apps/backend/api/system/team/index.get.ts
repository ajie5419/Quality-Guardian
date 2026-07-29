import {
  teamIdentityListQuerySchema,
  TeamIdentityService,
} from '~/modules/team';
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
  teamIdentityListQuerySchema,
  async (event, query) => {
    const adminCheck = requireSystemAdmin(event, getCurrentUser(event));
    if (adminCheck) return adminCheck;
    try {
      return useResponseSuccess(await TeamIdentityService.listOptions(query));
    } catch (error: unknown) {
      logApiError('team-list', error, undefined, event);
      if (isBusinessError(error)) return businessErrorResponse(event, error);
      return internalServerErrorResponse(
        event,
        'Failed to list TEAM identities',
      );
    }
  },
);
