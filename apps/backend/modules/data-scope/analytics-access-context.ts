import type { ResolvedDataScope } from './data-scope.service';

import { BusinessError } from '~/utils/business-error';

/**
 * Minimal user identity required by every analytics read. `userId` is
 * mandatory so a missing auth context can never degrade to a full-table
 * aggregate (fail-closed).
 */
export interface AnalyticsUser {
  userId: string;
  username?: string;
}

/**
 * Uniform access context for Dashboard / Report / Workspace aggregate reads
 * (SEC-ANALYTICS-SCOPE-001).
 *
 * `dataScope` is optional and only populated when the route already resolved
 * a scope for its own module (e.g. the middleware-resolved
 * `event.context.dataScope` under a protected module prefix). Cross-module
 * sources resolve their own scope through `DataScopeService` per module so
 * each source keeps its own ownership fields (inspection -> responsible
 * department / inspector, after-sales -> respDept / handler, ...).
 */
export interface AnalyticsAccessContext {
  user: AnalyticsUser;
  dataScope?: ResolvedDataScope;
}

/**
 * Fail-closed guard for analytics entry points. When a caller claims to pass
 * an access context but the user cannot be identified, the request is denied
 * instead of falling back to an unscoped (full-table) aggregate.
 */
export function requireAnalyticsUser(
  access?: AnalyticsAccessContext,
): AnalyticsUser {
  const userId = String(access?.user?.userId ?? '').trim();
  if (!userId) {
    throw new BusinessError(
      'FORBIDDEN',
      'Analytics access context is missing a user; request denied',
      403,
    );
  }
  return {
    userId,
    username: access?.user?.username,
  };
}
