import type { EventHandlerRequest, H3Event } from 'h3';
import type { UserSession } from '~/utils/jwt-utils';

import { forbiddenResponse } from '~/utils/response';

function isAdminRole(role: string) {
  const normalizedRole = role.trim().toLowerCase();
  return normalizedRole.includes('admin') || normalizedRole.includes('super');
}

export function isSystemAdmin(userinfo: null | UserSession) {
  if (!userinfo) {
    return false;
  }
  return (userinfo.roles || []).some((role) => isAdminRole(role));
}

export function requireSystemAdmin(
  event: H3Event<EventHandlerRequest>,
  userinfo: null | UserSession,
) {
  if (isSystemAdmin(userinfo)) {
    return null;
  }
  return forbiddenResponse(event, '拒绝访问：仅限管理员');
}
