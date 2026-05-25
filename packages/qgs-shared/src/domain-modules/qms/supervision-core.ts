import {
  ISSUE_TRACKING_STATUS,
  normalizeIssueTrackingStatus,
} from './issue-tracking-status';

export const SUPERVISION_PROJECT_STATUS = {
  COMPLETED: 'COMPLETED',
  IN_PROGRESS: 'IN_PROGRESS',
  PAUSED: 'PAUSED',
  PLANNED: 'PLANNED',
} as const;

type SupervisionProjectStatus =
  (typeof SUPERVISION_PROJECT_STATUS)[keyof typeof SUPERVISION_PROJECT_STATUS];

export const SUPERVISION_PROJECT_TYPE = {
  BRIDGE: 'BRIDGE',
  MOLD: 'MOLD',
  VEHICLE: 'VEHICLE',
} as const;

type SupervisionProjectType =
  (typeof SUPERVISION_PROJECT_TYPE)[keyof typeof SUPERVISION_PROJECT_TYPE];

export const SUPERVISION_PROJECT_STATUS_SET = new Set<string>(
  Object.values(SUPERVISION_PROJECT_STATUS),
);
export const SUPERVISION_PROJECT_TYPE_SET = new Set<string>(
  Object.values(SUPERVISION_PROJECT_TYPE),
);

export function normalizeSupervisionText(value: unknown) {
  return String(value ?? '').trim();
}

export function normalizeSupervisionDate(value: unknown) {
  const text = normalizeSupervisionText(value);
  if (!text) return undefined;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function normalizeSupervisionPercent(value: unknown, fallback = 0) {
  const text =
    typeof value === 'string' ? value.replace('%', '').trim() : value;
  const parsed = Number(text);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(100, Math.max(0, Math.trunc(parsed)));
}

export function normalizeSupervisionQuantity(value: unknown, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.round(parsed * 100) / 100);
}

export function normalizeSupervisionPositiveQuantity(
  value: unknown,
  fallback = 1,
) {
  const quantity = normalizeSupervisionQuantity(value, fallback);
  return quantity > 0 ? quantity : fallback;
}

export function calculateSupervisionQuantityProgress(
  completed: number,
  planned: number,
) {
  if (planned <= 0) return 0;
  return normalizeSupervisionPercent((completed / planned) * 100);
}

export function normalizeSupervisionDurationDays(value: unknown) {
  const text = normalizeSupervisionText(value);
  if (!text) return undefined;
  const matched = text.match(/-?\d+(?:\.\d+)?/);
  if (!matched) return undefined;
  const parsed = Number(matched[0]);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : undefined;
}

export function stringifySupervisionList(value: unknown) {
  if (!Array.isArray(value)) return null;
  const list = value
    .map((item) => normalizeSupervisionText(item))
    .filter(Boolean);
  return list.length > 0 ? JSON.stringify(list) : null;
}

export function parseSupervisionList(value?: null | string) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export function normalizeSupervisionProjectStatus(
  value: unknown,
): SupervisionProjectStatus {
  const status = normalizeSupervisionText(value).toUpperCase();
  return SUPERVISION_PROJECT_STATUS_SET.has(status)
    ? (status as SupervisionProjectStatus)
    : SUPERVISION_PROJECT_STATUS.PLANNED;
}

export function normalizeSupervisionProjectType(
  value: unknown,
): SupervisionProjectType {
  const type = normalizeSupervisionText(value).toUpperCase();
  return SUPERVISION_PROJECT_TYPE_SET.has(type)
    ? (type as SupervisionProjectType)
    : SUPERVISION_PROJECT_TYPE.MOLD;
}

export function normalizeSupervisionIssueStatus(value: unknown) {
  return normalizeIssueTrackingStatus(value, {
    allowed: [
      ISSUE_TRACKING_STATUS.OPEN,
      ISSUE_TRACKING_STATUS.IN_PROGRESS,
      ISSUE_TRACKING_STATUS.CLOSED,
      ISSUE_TRACKING_STATUS.VERIFYING,
    ],
    fallback: ISSUE_TRACKING_STATUS.OPEN,
  });
}

type SupervisionPlanTaskStatus =
  | 'DELAYED'
  | 'DONE'
  | 'DUE_SOON'
  | 'IN_PROGRESS'
  | 'NOT_STARTED'
  | 'RISK';

export function calculateSupervisionPlanTaskStatus(task: {
  actualEndAt?: Date | null;
  actualStartAt?: Date | null;
  plannedEndAt?: Date | null;
  plannedStartAt?: Date | null;
  progressPercent?: null | number;
  riskLevel?: null | string;
}): SupervisionPlanTaskStatus {
  const progress = normalizeSupervisionPercent(task.progressPercent);
  if (progress >= 100 || task.actualEndAt) return 'DONE';
  const now = new Date();
  const startAt = task.plannedStartAt ? new Date(task.plannedStartAt) : null;
  const endAt = task.plannedEndAt ? new Date(task.plannedEndAt) : null;
  const hasStarted = Boolean(task.actualStartAt) || progress > 0;
  const isRisk =
    normalizeSupervisionText(task.riskLevel).toUpperCase() === 'RISK';
  if (!hasStarted) {
    if (startAt) {
      const startOfDay = new Date(startAt);
      startOfDay.setHours(0, 0, 0, 0);
      if (startOfDay <= now) return 'DELAYED';
    }
    if (isRisk) return 'RISK';
    return 'NOT_STARTED';
  }
  if (endAt) {
    const endOfDay = new Date(endAt);
    endOfDay.setHours(23, 59, 59, 999);
    if (endOfDay < now) return 'DELAYED';
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    if (endOfDay.getTime() - now.getTime() <= sevenDays) return 'DUE_SOON';
  }
  if (isRisk) return 'RISK';
  return 'IN_PROGRESS';
}
