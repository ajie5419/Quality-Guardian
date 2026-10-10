import { eventHandler, setResponseStatus } from 'h3';
import { uniqueNonEmpty } from '~/modules/rbac/rbac-role.service';
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
    // getUserPermissionCodes already applies the derived inspection page
    // codes; only stale/invisible characters still need normalizing.
    return useResponseSuccess(uniqueNonEmpty(codes));
  } catch (error) {
    logApiError('codes', error, undefined, event);
    setResponseStatus(event, 500);
    return useResponseError('Failed to fetch permission codes');
  }
});
