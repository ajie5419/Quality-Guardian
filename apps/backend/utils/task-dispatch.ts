import type { Prisma } from '@prisma/client';

import {
  buildTaskDispatchCurrentUserLookupConditions,
  buildTaskDispatchPayloadCore,
  getTaskDispatchArchiveFilterRule,
  isTaskDispatchLevelTwo,
  normalizeTaskDispatchStatus,
  resolveTaskDispatchUsername,
  resolveTaskDispatchAssigneeCandidates,
  resolveTaskDispatchAssigneeFilterRule,
  resolveTaskDispatchItpProjectIdForValidation,
  resolveTaskDispatchParentIdForPromotion,
  resolveTaskDispatchStatusFilterRule,
  resolveTaskDispatchUserId,
  TASK_DISPATCH_STATUS,
} from '@qgs/domain';

export { TASK_DISPATCH_STATUS };

export function getTaskDispatchArchiveFilter(): Prisma.qms_task_dispatchesWhereInput {
  return getTaskDispatchArchiveFilterRule() as Prisma.qms_task_dispatchesWhereInput;
}

export function resolveTaskDispatchAssigneeFilter(params: {
  all: unknown;
  currentUserId: string;
  isAdmin: boolean;
  parentId: unknown;
}): Prisma.qms_task_dispatchesWhereInput {
  return resolveTaskDispatchAssigneeFilterRule(
    params,
  ) as Prisma.qms_task_dispatchesWhereInput;
}

export function resolveTaskDispatchStatusFilter(
  status: unknown,
): Prisma.qms_task_dispatchesWhereInput['status'] {
  return resolveTaskDispatchStatusFilterRule(
    status,
  ) as Prisma.qms_task_dispatchesWhereInput['status'];
}

export { normalizeTaskDispatchStatus, resolveTaskDispatchUserId };

interface TaskDispatchCurrentUserInfo {
  id?: unknown;
  userId?: unknown;
  username?: unknown;
}

interface TaskDispatchUserLookupClient {
  users: {
    findFirst(args: {
      select: { id: true };
      where: { OR: Array<{ id: string } | { username: string }> };
    }): Promise<null | { id: string }>;
  };
}

export async function resolveTaskDispatchCurrentUserId(
  userinfo: TaskDispatchCurrentUserInfo,
  userLookupClient: TaskDispatchUserLookupClient,
): Promise<null | string> {
  const tokenUserId = resolveTaskDispatchUserId(userinfo);
  const username = resolveTaskDispatchUsername(userinfo);

  if (!tokenUserId && !username) {
    return null;
  }

  const currentUser = await userLookupClient.users.findFirst({
    where: {
      OR: buildTaskDispatchCurrentUserLookupConditions({
        tokenUserId,
        username,
      }),
    },
    select: { id: true },
  });

  return currentUser?.id ?? null;
}

export {
  isTaskDispatchLevelTwo,
  resolveTaskDispatchAssigneeCandidates,
  resolveTaskDispatchItpProjectIdForValidation,
  resolveTaskDispatchParentIdForPromotion,
};
export { resolveTaskDispatchLevel } from '@qgs/domain';

export function buildTaskDispatchCreateData(
  body: Record<string, unknown>,
  options: {
    assigneeId: string;
    assignorId: string;
  },
): Prisma.qms_task_dispatchesUncheckedCreateInput {
  return buildTaskDispatchPayloadCore(
    body,
    options,
  ) as Prisma.qms_task_dispatchesUncheckedCreateInput;
}
