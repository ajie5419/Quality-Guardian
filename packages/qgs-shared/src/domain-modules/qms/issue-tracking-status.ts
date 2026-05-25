/**
 * Canonical issue-tracking status rules shared by backend and frontend.
 */
export const ISSUE_TRACKING_STATUS = {
  CLAIMING: 'CLAIMING',
  CLOSED: 'CLOSED',
  IN_PROGRESS: 'IN_PROGRESS',
  NO_ISSUE: 'NO_ISSUE',
  OPEN: 'OPEN',
  RESOLVED: 'RESOLVED',
  VERIFYING: 'VERIFYING',
} as const;

export type IssueTrackingStatus =
  (typeof ISSUE_TRACKING_STATUS)[keyof typeof ISSUE_TRACKING_STATUS];

const ISSUE_TRACKING_STATUS_ALIASES: Record<string, IssueTrackingStatus> = {
  CLAIMING: ISSUE_TRACKING_STATUS.CLAIMING,
  CLOSED: ISSUE_TRACKING_STATUS.CLOSED,
  IN_PROGRESS: ISSUE_TRACKING_STATUS.IN_PROGRESS,
  NO_ISSUE: ISSUE_TRACKING_STATUS.NO_ISSUE,
  OPEN: ISSUE_TRACKING_STATUS.OPEN,
  RESOLVED: ISSUE_TRACKING_STATUS.RESOLVED,
  VERIFYING: ISSUE_TRACKING_STATUS.VERIFYING,

  closed: ISSUE_TRACKING_STATUS.CLOSED,
  in_progress: ISSUE_TRACKING_STATUS.IN_PROGRESS,
  'in progress': ISSUE_TRACKING_STATUS.IN_PROGRESS,
  no_issue: ISSUE_TRACKING_STATUS.NO_ISSUE,
  open: ISSUE_TRACKING_STATUS.OPEN,
  resolved: ISSUE_TRACKING_STATUS.RESOLVED,
  verifying: ISSUE_TRACKING_STATUS.VERIFYING,
  claiming: ISSUE_TRACKING_STATUS.CLAIMING,

  开启: ISSUE_TRACKING_STATUS.OPEN,
  待处理: ISSUE_TRACKING_STATUS.OPEN,
  处理中: ISSUE_TRACKING_STATUS.IN_PROGRESS,
  进行中: ISSUE_TRACKING_STATUS.IN_PROGRESS,
  索赔中: ISSUE_TRACKING_STATUS.CLAIMING,
  待验证: ISSUE_TRACKING_STATUS.RESOLVED,
  验证中: ISSUE_TRACKING_STATUS.VERIFYING,
  已解决: ISSUE_TRACKING_STATUS.RESOLVED,
  已关闭: ISSUE_TRACKING_STATUS.CLOSED,
  无问题: ISSUE_TRACKING_STATUS.NO_ISSUE,
};

const DEFAULT_ALLOWED_ISSUE_TRACKING_STATUSES: IssueTrackingStatus[] = [
  ISSUE_TRACKING_STATUS.OPEN,
  ISSUE_TRACKING_STATUS.IN_PROGRESS,
  ISSUE_TRACKING_STATUS.RESOLVED,
  ISSUE_TRACKING_STATUS.CLOSED,
];

function normalizeIssueTrackingStatusKey(value: unknown): string {
  return String(value ?? '')
    .trim()
    .replaceAll(/\s+/g, '_')
    .toUpperCase();
}

export function normalizeIssueTrackingStatus(
  value: unknown,
  options: {
    allowed?: IssueTrackingStatus[];
    fallback?: IssueTrackingStatus;
  } = {},
): IssueTrackingStatus {
  const normalized = normalizeIssueTrackingStatusKey(value);
  const allowed = options.allowed || DEFAULT_ALLOWED_ISSUE_TRACKING_STATUSES;
  const fallback = options.fallback || ISSUE_TRACKING_STATUS.OPEN;

  if (!normalized) {
    return fallback;
  }

  const mapped = ISSUE_TRACKING_STATUS_ALIASES[normalized];
  if (!mapped) {
    return fallback;
  }

  return allowed.includes(mapped) ? mapped : fallback;
}

export function deriveIssueTrackingStatus(
  statuses: unknown[],
): IssueTrackingStatus {
  if (!Array.isArray(statuses) || statuses.length === 0) {
    return ISSUE_TRACKING_STATUS.NO_ISSUE;
  }

  const normalizedSet = new Set(
    statuses.map((status) =>
      normalizeIssueTrackingStatus(status, {
        allowed: [
          ISSUE_TRACKING_STATUS.CLAIMING,
          ISSUE_TRACKING_STATUS.CLOSED,
          ISSUE_TRACKING_STATUS.IN_PROGRESS,
          ISSUE_TRACKING_STATUS.OPEN,
          ISSUE_TRACKING_STATUS.RESOLVED,
          ISSUE_TRACKING_STATUS.VERIFYING,
        ],
        fallback: ISSUE_TRACKING_STATUS.OPEN,
      }),
    ),
  );

  if (normalizedSet.has(ISSUE_TRACKING_STATUS.OPEN)) {
    return ISSUE_TRACKING_STATUS.OPEN;
  }

  if (
    normalizedSet.has(ISSUE_TRACKING_STATUS.IN_PROGRESS) ||
    normalizedSet.has(ISSUE_TRACKING_STATUS.CLAIMING)
  ) {
    return ISSUE_TRACKING_STATUS.IN_PROGRESS;
  }

  if (
    normalizedSet.has(ISSUE_TRACKING_STATUS.RESOLVED) ||
    normalizedSet.has(ISSUE_TRACKING_STATUS.VERIFYING)
  ) {
    return ISSUE_TRACKING_STATUS.RESOLVED;
  }

  if (normalizedSet.has(ISSUE_TRACKING_STATUS.CLOSED)) {
    return ISSUE_TRACKING_STATUS.CLOSED;
  }

  return ISSUE_TRACKING_STATUS.OPEN;
}
