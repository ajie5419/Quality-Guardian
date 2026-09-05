export { requireAnalyticsUser } from './analytics-access-context';
export type {
  AnalyticsAccessContext,
  AnalyticsUser,
} from './analytics-access-context';
export { DataScopeService } from './data-scope.service';
export type { ResolvedDataScope } from './data-scope.service';
export {
  assertScopedWriteAffected,
  assertVersionedWriteAffected,
  createScopedRepository,
} from './scoped-repository';
export type {
  AccessScope,
  ScopedAccessContext,
  ScopedModelName,
} from './scoped-repository';
