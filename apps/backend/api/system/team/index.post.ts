import { teamIdentityCreateSchema, TeamIdentityService } from '~/modules/team';
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
  teamIdentityCreateSchema,
  async (event, body) => {
    const userinfo = getCurrentUser(event);
    const adminCheck = requireSystemAdmin(event, userinfo);
    if (adminCheck) return adminCheck;
    try {
      return useResponseSuccess(
        await TeamIdentityService.create(
          body,
          String(userinfo.username || userinfo.id),
        ),
      );
    } catch (error: unknown) {
      logApiError('team-create', error, undefined, event);
      if (isBusinessError(error)) return businessErrorResponse(event, error);
      return internalServerErrorResponse(
        event,
        'Failed to create TEAM identity',
      );
    }
  },
);
