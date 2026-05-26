import { eventHandler } from 'h3';
import { RbacService } from '~/modules/rbac/rbac.service';
import { logApiError } from '~/utils/api-logger';
import { getCurrentUser } from '~/utils/current-user';

export default eventHandler(async (event) => {
  const userinfo = getCurrentUser(event);

  try {
    return await RbacService.getMenuTreeForUser(userinfo);
  } catch (error) {
    logApiError('all', error, undefined, event);
    throw error;
  }
});
