import type { UserSession } from '~/utils/jwt-utils';

import { isSystemAdmin } from '@qgs/shared';

/**
 * SEC-SUPERVISION-001 object-authorization context.
 *
 * Supervision resources have no department dimension, so row-level access is
 * creator-scoped: admins (super/admin) reach every row, other authenticated
 * users may only write rows they created. Rows without a creator (pre-migration
 * data) are admin-only, which fails closed instead of widening access.
 */
export interface SupervisionAccessContext {
  isAdmin: boolean;
  userId: string;
  user: {
    id: number | string;
    realName: string;
    roles: string[];
    username: string;
  };
}

export function buildSupervisionAccessContext(
  userinfo: UserSession,
): SupervisionAccessContext {
  const userId = String(userinfo.id ?? userinfo.userId ?? '');
  return {
    isAdmin: isSystemAdmin(userinfo),
    userId,
    user: {
      id: userinfo.id ?? userinfo.userId ?? '',
      realName: userinfo.realName,
      roles: userinfo.roles,
      username: userinfo.username,
    },
  };
}

export function isSupervisionAdmin(
  context: Pick<SupervisionAccessContext, 'isAdmin'>,
): boolean {
  return context.isAdmin;
}

/**
 * Access predicate for a supervision resource. Every user write must merge
 * this into its where clause so a bare id can never bypass row-level access.
 * Tasks inherit the parent project's creator scope.
 */
export function buildSupervisionAccessWhere(
  resource: 'issue' | 'project' | 'report' | 'task',
  context: SupervisionAccessContext,
) {
  if (isSupervisionAdmin(context)) return {};
  switch (resource) {
    case 'issue':
    case 'project':
    case 'report': {
      return { createdBy: context.userId };
    }
    case 'task': {
      // Tasks carry no owner column; they inherit the parent project scope.
      return { project: { createdBy: context.userId } };
    }
  }
}
