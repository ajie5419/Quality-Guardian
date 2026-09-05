import type { AccessScope } from '~/modules/data-scope';
import type { UserSession } from '~/utils/jwt-utils';

export type InspectionObjectAuthorization =
  | { kind: 'INSPECTOR_OR_ADMIN'; requestId: string }
  | { kind: 'READ'; requestId: string }
  | { kind: 'REPORTER_OR_DISPATCH'; requestId: string };

export interface InspectionAccessContext {
  dataScope?: AccessScope;
  objectAuthorization?: InspectionObjectAuthorization;
  permission: string;
  scopeIdentity: { deptIds?: string[]; scopeType?: AccessScope['scopeType'] };
  user: UserSession;
}

export function toScopedAccessContext(context: InspectionAccessContext) {
  const userId = context.user.userId || context.user.id;
  if (!userId) throw new Error('Inspection access context missing user');
  return {
    scope: context.dataScope,
    user: { id: userId, username: context.user.username },
  };
}
