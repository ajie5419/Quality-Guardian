import { TeamIdentityService, teamIdentityUpdateSchema } from '~/modules/team';
import { requireSystemAdmin } from '~/modules/user/system-auth';
import { logApiError } from '~/utils/api-logger';
import { businessErrorResponse, isBusinessError } from '~/utils/business-error';
import { getCurrentUser } from '~/utils/current-user';
import { defineValidatedHandler } from '~/utils/define-validated-handler';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';

export default defineValidatedHandler(
  teamIdentityUpdateSchema,
  async (event, body) => {
    const userinfo = getCurrentUser(event);
    const adminCheck = requireSystemAdmin(event, userinfo);
    if (adminCheck) return adminCheck;
    const id = getRequiredRouterParam(event, 'id', 'TEAM ID is required');
    if (typeof id !== 'string') return id;
    try {
      return useResponseSuccess(
        await TeamIdentityService.update(
          id,
          body,
          String(userinfo.username || userinfo.id),
        ),
      );
    } catch (error: unknown) {
      logApiError('team-update', error, undefined, event);
      if (isBusinessError(error)) return businessErrorResponse(event, error);
      return internalServerErrorResponse(
        event,
        'Failed to update TEAM identity',
      );
    }
  },
);
