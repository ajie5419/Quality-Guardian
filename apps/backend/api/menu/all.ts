import { eventHandler } from 'h3';
import { verifyAccessToken } from '~/utils/jwt-utils';
import { MOCK_MENUS } from '~/utils/mock-data';
import { unAuthorizedResponse, useResponseSuccess } from '~/utils/response';

export default eventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  // Role-based Menu Configuration
  // Map RBAC roles to Mock Configuration Users
  const role = userinfo.roles?.[0] || 'guest';
  let configUsername = 'guest';

  // Define mapping logic (Role -> Config Template)
  if (role === 'super' || role === 'Super Admin') configUsername = 'vben';
  else if (role === 'admin' || role.includes('admin')) configUsername = 'admin';
  else if (role === 'user') configUsername = 'jack';

  const menus =
    MOCK_MENUS.find((item) => item.username === configUsername)?.menus ?? [];
  return useResponseSuccess(menus);
});
