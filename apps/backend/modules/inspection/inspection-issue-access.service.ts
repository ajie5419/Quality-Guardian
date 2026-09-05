import type { Prisma } from '@prisma/client';
import type { AccessScope } from '~/modules/data-scope';
import type { UserSession } from '~/utils/jwt-utils';

import { shouldRestrictInspectionIssueRead } from '@qgs/shared';
import { DataScopeService } from '~/modules/data-scope';
import { RbacService } from '~/modules/rbac/rbac.service';
import { BusinessError } from '~/utils/business-error';

export interface InspectionIssueUserContext {
  dataScope?: AccessScope;
  roles?: unknown;
  userId: string;
  username?: string;
}

/** Canonical scope builder shared by issue list, detail and statistics. */
export async function buildInspectionIssueScopeWhere(
  where: Prisma.quality_recordsWhereInput,
  userContext: InspectionIssueUserContext,
): Promise<Prisma.quality_recordsWhereInput> {
  const scopedWhere = await DataScopeService.buildScopedWhere(
    'inspection',
    where,
    { userId: userContext.userId, username: userContext.username },
    userContext.dataScope,
  );
  // Legacy direct service callers may not yet carry middleware scope. Keep
  // their existing ownership restriction while all HTTP callers provide the
  // canonical scope explicitly.
  return userContext.dataScope
    ? scopedWhere
    : applyInspectionIssueReadOwnership(scopedWhere, userContext);
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
