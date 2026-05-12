import { eventHandler, setResponseStatus } from 'h3';
import { RbacService } from '~/services/rbac.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  ensureFileCenterMenu,
  ensureInspectionRequestMenu,
  ensureMetrologyMenu,
  ensureVehicleCommissioningMenu,
} from '~/utils/menu-bootstrap';
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
    await ensureFileCenterMenu();
    await ensureVehicleCommissioningMenu();
    await ensureInspectionRequestMenu();
    await ensureMetrologyMenu();
    const codes = await RbacService.getUserPermissionCodes(String(userId));
    const normalizedCodes = new Set(codes);
    if (
      normalizedCodes.has('QMS:Inspection:Requests:Close') ||
      normalizedCodes.has('QMS:Inspection:Requests:Dispatch')
    ) {
      normalizedCodes.add('QMS:Inspection:Requests:List');
    }
    return useResponseSuccess([...normalizedCodes]);
  } catch (error) {
    logApiError('codes', error);
    setResponseStatus(event, 500);
    return useResponseError('Failed to fetch permission codes');
  }
});
