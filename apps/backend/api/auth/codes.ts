import { eventHandler, setResponseStatus } from 'h3';
import { RbacService } from '~/services/rbac.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import { ensureVehicleCommissioningMenu } from '~/utils/menu-bootstrap';
import {
  unAuthorizedResponse,
  useResponseError,
  useResponseSuccess,
} from '~/utils/response';

export default eventHandler(async (event) => {
  const userinfo = await verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  const userId = userinfo.userId || userinfo.id;
  if (!userId) {
    return useResponseSuccess([]);
  }

  try {
    await ensureVehicleCommissioningMenu();
    const codes = await RbacService.getUserPermissionCodes(String(userId));
    return useResponseSuccess(codes);
  } catch (error) {
    logApiError('codes', error);
    setResponseStatus(event, 500);
    return useResponseError('Failed to fetch permission codes');
  }
});
