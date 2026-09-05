import type {
  AnalyticsAccessContext,
  ResolvedDataScope,
} from '~/modules/data-scope';

import { Prisma } from '@prisma/client';
import { DataScopeService, requireAnalyticsUser } from '~/modules/data-scope';

type AnalyticsScope = Pick<ResolvedDataScope, 'deptIds' | 'scopeType'>;

/**
 * Resolves the inspection-domain DataScope for an analytics read. Routes
 * outside the protected module prefixes have no middleware-resolved scope,
 * so the scope is resolved from the user on demand (fail-closed: a missing
 * userId throws FORBIDDEN).
 */
export async function resolveInspectionScope(
  access?: AnalyticsAccessContext,
): Promise<AnalyticsScope | null> {
  if (!access) return null;
  const user = requireAnalyticsUser(access);
  if (access.dataScope) return access.dataScope;
  return DataScopeService.getScopeForModule(user.userId, 'inspection');
}

/**
 * Named scoped-SQL fragment for raw inspection aggregates (R-SCOPE-RAW
 * compliant). DEPT matches by department name candidates; SELF matches the
 * inspector username; empty scope candidates fail closed to `AND 1 = 0`.
 */
export async function buildInspectionRawScopeSql(
  access?: AnalyticsAccessContext,
): Promise<Prisma.Sql> {
  const scope = await resolveInspectionScope(access);
  if (!scope || scope.scopeType === 'ALL') return Prisma.empty;
  if (scope.scopeType === 'SELF') {
    const user = requireAnalyticsUser(access);
    return Prisma.sql`AND inspector = ${user.username || user.userId}`;
  }
  const deptCandidates = await DataScopeService.getDeptCandidates(
    scope.deptIds ?? [],
  );
  if (deptCandidates.length === 0) return Prisma.sql`AND 1 = 0`;
  return Prisma.sql`AND responsibleDepartment IN (${Prisma.join(deptCandidates)})`;
}

export async function buildScopedInspectionWhere(
  baseWhere: Prisma.inspectionsWhereInput,
  access?: AnalyticsAccessContext,
): Promise<Prisma.inspectionsWhereInput> {
  if (!access) return baseWhere;
  const user = requireAnalyticsUser(access);
  return DataScopeService.buildScopedWhere(
    'inspection',
    baseWhere,
    user,
    access.dataScope,
  );
}

export async function buildScopedIssueWhere(
  baseWhere: Prisma.quality_recordsWhereInput,
  access?: AnalyticsAccessContext,
): Promise<Prisma.quality_recordsWhereInput> {
  if (!access) return baseWhere;
  const user = requireAnalyticsUser(access);
  return DataScopeService.buildInspectionWhere(
    baseWhere,
    user,
    access.dataScope,
  );
}
