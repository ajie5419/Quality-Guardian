export const TASK_DISPATCH_STATUS = {
  COMPLETED: 'COMPLETED',
  DISPATCHED: 'DISPATCHED',
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
} as const;

const TASK_DISPATCH_STATUS_SET = new Set<string>(
  Object.values(TASK_DISPATCH_STATUS),
);

function normalizeTaskDispatchText(value: unknown): string {
  return String(value ?? '').trim();
}

function parseTaskDispatchInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return parsed > 0 ? Math.trunc(parsed) : fallback;
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

export interface TaskDispatchArchiveFilterRule {
  AND: [
    {
      OR: [
        { itpProjectId: null },
        { itp_project: { planStatus: { not: string } } },
      ];
    },
    {
      OR: [
        { dfmeaId: null },
        { dfmea_project: { status: { not: string } } },
      ];
    },
  ];
}

export function getTaskDispatchArchiveFilterRule(): TaskDispatchArchiveFilterRule {
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

export interface TaskDispatchAssigneeFilterInput {
  all: unknown;
  currentUserId: string;
  isAdmin: boolean;
  parentId: unknown;
}

export interface TaskDispatchAssigneeFilterRule {
  assigneeId?: string;
  parentId?: string;
}

export function resolveTaskDispatchAssigneeFilterRule(
  params: TaskDispatchAssigneeFilterInput,
): TaskDispatchAssigneeFilterRule {
  const { all, currentUserId, isAdmin, parentId } = params;

  if (parentId) {
    return { parentId: String(parentId) };
  }

  if (isAdmin && all === 'true') {
    return {};
  }

  return { assigneeId: currentUserId };
}

export type TaskDispatchStatusFilterRule = string | { in: string[] } | undefined;

export function resolveTaskDispatchStatusFilterRule(
  status: unknown,
): TaskDispatchStatusFilterRule {
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

export function resolveTaskDispatchLevel(value: unknown, fallback = 1): number {
  return parseTaskDispatchInt(value, fallback);
}

export function isTaskDispatchLevelTwo(body: Record<string, unknown>): boolean {
  return resolveTaskDispatchLevel(body.level, 1) === 2;
}

export function resolveTaskDispatchAssigneeCandidates(
  assigneeId: unknown,
): null | { id: string; username: string } {
  const normalized = normalizeTaskDispatchText(assigneeId);
  if (!normalized) {
    return null;
  }

  return { id: normalized, username: normalized };
}

export function resolveTaskDispatchItpProjectIdForValidation(
  body: Record<string, unknown>,
): null | string {
  if (body.type !== 'ITP_INSPECTION') {
    return null;
  }

  const projectId = normalizeTaskDispatchText(body.itpProjectId);
  return projectId || null;
}

export function resolveTaskDispatchParentIdForPromotion(
  body: Record<string, unknown>,
): null | string {
  const level = resolveTaskDispatchLevel(body.level, 1);
  if (level !== 2) {
    return null;
  }

  const parentId = normalizeTaskDispatchText(body.parentId);
  return parentId || null;
}

export function buildTaskDispatchPayloadCore(
  body: Record<string, unknown>,
  options: {
    assigneeId: string;
    assignorId: string;
  },
) {
  const dueDateText = normalizeTaskDispatchText(body.deadline);

  return {
    assignorId: options.assignorId,
    assigneeId: options.assigneeId,
    content: body.content ? normalizeTaskDispatchText(body.content) : null,
    dfmeaId: body.dfmeaId ? normalizeTaskDispatchText(body.dfmeaId) : null,
    dueDate: dueDateText ? new Date(dueDateText) : null,
    itpProjectId: body.itpProjectId
      ? normalizeTaskDispatchText(body.itpProjectId)
      : null,
    level: resolveTaskDispatchLevel(body.level, 1),
    parentId: body.parentId ? normalizeTaskDispatchText(body.parentId) : null,
    priority: parseTaskDispatchInt(body.priority, 2),
    title: normalizeTaskDispatchText(body.title),
    type: normalizeTaskDispatchText(body.type),
    updatedAt: new Date(),
  };
}
