import type { Prisma } from '@prisma/client';

import {
  buildTaskDispatchPayloadCore,
  isTaskDispatchLevelTwo,
  normalizeTaskDispatchStatus,
  resolveTaskDispatchAssigneeCandidates,
  resolveTaskDispatchItpProjectIdForValidation,
  resolveTaskDispatchLevel,
  resolveTaskDispatchParentIdForPromotion,
  resolveTaskDispatchUserId,
  TASK_DISPATCH_STATUS,
} from '@qgs/domain';

export { TASK_DISPATCH_STATUS };

export function getTaskDispatchArchiveFilter(): Prisma.qms_task_dispatchesWhereInput {
  return {
    AND: [
      {
        OR: [
          { itpProjectId: null },
          { itp_project: { planStatus: { not: 'ARCHIVED' } } },
        ],
      },
      {
        OR: [
          { dfmeaId: null },
          { dfmea_project: { status: { not: 'archived' } } },
        ],
      },
    ],
  };
}

export function resolveTaskDispatchAssigneeFilter(params: {
  all: unknown;
  currentUserId: string;
  isAdmin: boolean;
  parentId: unknown;
}): Prisma.qms_task_dispatchesWhereInput {
  const { all, currentUserId, isAdmin, parentId } = params;

  if (parentId) {
    return { parentId: String(parentId) };
  }

  if (isAdmin && all === 'true') {
    return {};
  }

  return { assigneeId: currentUserId };
}

export function resolveTaskDispatchStatusFilter(
  status: unknown,
): Prisma.qms_task_dispatchesWhereInput['status'] {
  if (!status) {
    return undefined;
  }

  const statusList = String(status)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  if (statusList.length === 0) {
    return undefined;
  }

  return statusList.length > 1 ? { in: statusList } : statusList[0];
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
  const username =
    typeof userinfo.username === 'string' ? userinfo.username.trim() : '';

  if (!tokenUserId && !username) {
    return null;
  }

  const currentUser = await userLookupClient.users.findFirst({
    where: {
      OR: [
        ...(tokenUserId ? [{ id: tokenUserId }] : []),
        ...(username ? [{ username }] : []),
      ],
    },
    select: { id: true },
  });

  return currentUser?.id ?? null;
}

export {
  isTaskDispatchLevelTwo,
  resolveTaskDispatchAssigneeCandidates,
  resolveTaskDispatchItpProjectIdForValidation,
  resolveTaskDispatchLevel,
  resolveTaskDispatchParentIdForPromotion,
};

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
