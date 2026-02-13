import type { Prisma } from '@prisma/client';

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
