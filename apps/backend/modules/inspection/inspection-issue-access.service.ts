import type { UserSession } from '~/utils/jwt-utils';

import { shouldRestrictInspectionIssueRead } from '@qgs/shared';
import { RbacService } from '~/modules/rbac/rbac.service';
import { BusinessError } from '~/utils/business-error';

export interface InspectionIssueUserContext {
  roles?: unknown;
  userId: string;
  username?: string;
}

export function applyInspectionIssueReadOwnership<T extends object>(
  where: T,
  userContext: InspectionIssueUserContext,
): T & { createdBy?: string } {
  if (!shouldRestrictInspectionIssueRead(userContext.roles)) return where;
  return { ...where, createdBy: userContext.userId };
}

export function applyInspectionIssueWriteOwnership<T extends object>(
  where: T,
  userContext: InspectionIssueUserContext,
): T & { createdBy?: string } {
  if (!shouldRestrictInspectionIssueRead(userContext.roles)) return where;
  return { ...where, createdBy: userContext.userId };
}

export const InspectionIssueAccessService = {
  async ensurePermission(userinfo: UserSession, permissionCode: string) {
    const userId = userinfo.userId || userinfo.id;
    const codes = userId
      ? await RbacService.getUserPermissionCodes(String(userId))
      : [];
    if (!codes.includes(permissionCode)) {
      throw new BusinessError('FORBIDDEN', '无不合格品项操作权限', 403);
    }
  },
  async getAccessContext(userinfo: UserSession, permissionCode: string) {
    await this.ensurePermission(userinfo, permissionCode);
    const userId = String(userinfo.userId || userinfo.id || '');
    const roles = userId ? await RbacService.getUserRoles(userId) : [];
    return {
      roles: roles.map((role) => role.name),
      userId,
    } satisfies InspectionIssueUserContext;
  },
};
