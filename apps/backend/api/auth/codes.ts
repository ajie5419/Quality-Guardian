import { eventHandler, setResponseStatus } from 'h3';
import { RbacService } from '~/modules/rbac/rbac.service';
import { logApiError } from '~/utils/api-logger';
import { getCurrentUser } from '~/utils/current-user';
import { ensureModuleMenus } from '~/utils/module-loader';
import { useResponseError, useResponseSuccess } from '~/utils/response';

export default eventHandler(async (event) => {
  const userinfo = getCurrentUser(event);

  const userId = userinfo.userId || userinfo.id;
  if (!userId) {
    return useResponseSuccess([]);
  }

  try {
    await ensureModuleMenus();
    const codes = await RbacService.getUserPermissionCodes(String(userId));
    const normalizedCodes = new Set(codes);
    if (normalizedCodes.has('QMS:Inspection:Requests:List')) {
      normalizedCodes.add('QMS:Inspection:Dashboard:List');
    }
    if (
      normalizedCodes.has('QMS:Inspection:Requests:Close') ||
      normalizedCodes.has('QMS:Inspection:Requests:Dispatch')
    ) {
      normalizedCodes.add('QMS:Inspection:Requests:List');
    }
    return useResponseSuccess([...normalizedCodes]);
  } catch (error) {
    logApiError('codes', error, undefined, event);
    setResponseStatus(event, 500);
    return useResponseError('Failed to fetch permission codes');
  }
});
