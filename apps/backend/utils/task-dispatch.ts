import type { Prisma } from '@prisma/client';

export const TASK_DISPATCH_STATUS = {
  COMPLETED: 'COMPLETED',
  DISPATCHED: 'DISPATCHED',
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
} as const;

const TASK_DISPATCH_STATUS_SET = new Set<string>(
  Object.values(TASK_DISPATCH_STATUS),
);

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

export function normalizeTaskDispatchStatus(status: unknown): null | string {
  if (status === undefined || status === null) {
    return null;
  }

  const normalized = String(status).trim().toUpperCase();
  if (!normalized) {
    return null;
  }

  return TASK_DISPATCH_STATUS_SET.has(normalized) ? normalized : null;
}

export function resolveTaskDispatchUserId(userinfo: {
  id?: unknown;
  userId?: unknown;
}): null | string {
  const raw = userinfo.id ?? userinfo.userId;
  if (raw === undefined || raw === null) {
    return null;
  }

  const userId = String(raw).trim();
  return userId || null;
}

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

export function getTaskDispatchMissingRequiredFields(
  body: Record<string, unknown>,
  fields: string[],
): string[] {
  return fields.filter((field) => {
    const value = body[field];
    if (value === undefined || value === null) {
      return true;
    }

    if (typeof value === 'string') {
      return value.trim().length === 0;
    }

    return false;
  });
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
