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
