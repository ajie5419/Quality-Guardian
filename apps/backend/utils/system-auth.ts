import type { EventHandlerRequest, H3Event } from 'h3';
import type { UserSession } from '~/utils/jwt-utils';

import { isSystemAdmin } from '@qgs/domain';
import { forbiddenResponse } from '~/utils/response';

export { isSystemAdmin };

export function requireSystemAdmin(
  event: H3Event<EventHandlerRequest>,
  userinfo: null | UserSession,
) {
  if (isSystemAdmin(userinfo)) {
    return null;
  }
  return forbiddenResponse(event, '拒绝访问：仅限管理员');
}
