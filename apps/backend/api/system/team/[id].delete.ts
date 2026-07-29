import { defineEventHandler } from 'h3';
import { TeamIdentityService } from '~/modules/team';
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
  const userinfo = getCurrentUser(event);
  const adminCheck = requireSystemAdmin(event, userinfo);
  if (adminCheck) return adminCheck;
  const id = getRequiredRouterParam(event, 'id', 'TEAM ID is required');
  if (typeof id !== 'string') return id;
  try {
    await TeamIdentityService.retire(
      id,
      String(userinfo.username || userinfo.id),
    );
    return useResponseSuccess(null);
  } catch (error: unknown) {
    logApiError('team-retire', error, undefined, event);
    if (isBusinessError(error)) return businessErrorResponse(event, error);
    return internalServerErrorResponse(event, 'Failed to retire TEAM identity');
  }
});
