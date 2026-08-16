import type { EventHandlerRequest, H3Event } from 'h3';
import type { UserSession } from '~/utils/jwt-utils';

import { ErrorCode } from '@qgs/shared';
import { BusinessError } from '~/utils/business-error';
import { getCurrentUser } from '~/utils/current-user';

import { RbacRoleService } from './rbac-role.service';

/**
 * Framework-level write authorization. Every write endpoint (post/put/
 * delete/patch) must call this (or requireSystemAdmin) with the permission
 * code declared for that operation; the architecture gate B-AUTH1 enforces
 * that declarations exist. Super roles are exempt via
 * getUserPermissionCodes merging all active menu codes.
 */
export async function authorizeWrite(
  event: H3Event<EventHandlerRequest>,
  permissionCode: string,
): Promise<UserSession> {
  const userinfo = getCurrentUser(event);
  if (!userinfo) {
    throw new BusinessError(ErrorCode.UNAUTHORIZED, '未登录或登录已过期', 401);
  }
  const userId = String(userinfo.userId ?? userinfo.id ?? '');
  if (!userId) {
    throw new BusinessError(ErrorCode.UNAUTHORIZED, '未登录或登录已过期', 401);
  }
  const codes = await RbacRoleService.getUserPermissionCodes(userId);
  if (!codes.includes(permissionCode)) {
    throw new BusinessError(
      ErrorCode.FORBIDDEN,
      '无权限执行此操作，请联系管理员',
      403,
    );
  }
  return userinfo;
}
