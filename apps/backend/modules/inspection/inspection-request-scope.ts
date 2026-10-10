import type { AccessScope, AnalyticsAccessContext } from '~/modules/data-scope';

import { Prisma } from '@prisma/client';
import { DataScopeService, requireAnalyticsUser } from '~/modules/data-scope';

/**
 * Request-domain scoped where for qms_inspection_requests aggregates
 * (SEC-INSPECTION-REQUEST-ANALYTICS-001). Mirrors the request list / history
 * scope semantics instead of the inspections-table generic scope:
 * - ALL: base where unchanged
 * - SELF: inspectorId OR reporterId (existing request ownership rule)
 * - DEPT: responsibleDepartment IN (deptId + deptName candidates)
 * - empty candidates / missing scope: fail closed to an impossible id
 */
export async function buildScopedInspectionRequestWhere(
  baseWhere: Prisma.qms_inspection_requestsWhereInput,
  access?: Omit<AnalyticsAccessContext, 'dataScope'> & {
    dataScope?: AccessScope;
  },
): Promise<Prisma.qms_inspection_requestsWhereInput> {
  const user = requireAnalyticsUser(access ? { user: access.user } : undefined);
  const scope = access?.dataScope;
  if (scope?.scopeType === 'ALL') {
    return baseWhere;
  }
  if (!scope) {
    return { AND: [baseWhere, { id: '__none__' }] };
  }
  if (scope.scopeType === 'SELF') {
    return {
      AND: [
        baseWhere,
        { OR: [{ inspectorId: user.userId }, { reporterId: user.userId }] },
      ],
    };
  }
  if (scope.scopeType !== 'DEPT') {
    return { AND: [baseWhere, { id: '__none__' }] };
  }
  const deptCandidates = await DataScopeService.getDeptCandidates(
    scope.deptIds ?? [],
  );
  if (deptCandidates.length === 0) {
    return { AND: [baseWhere, { id: '__none__' }] };
  }
  return {
    AND: [baseWhere, { responsibleDepartment: { in: deptCandidates } }],
  };
}
