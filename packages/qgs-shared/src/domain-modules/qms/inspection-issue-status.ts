/**
 * Canonical inspection-issue status rules shared by backend and frontend.
 */
export const INSPECTION_ISSUE_STATUS = {
  OPEN: 'OPEN',
  IN_PROGRESS: 'IN_PROGRESS',
  CLOSED: 'CLOSED',
} as const;

export type InspectionIssueStatus =
  (typeof INSPECTION_ISSUE_STATUS)[keyof typeof INSPECTION_ISSUE_STATUS];

const INSPECTION_ISSUE_STATUS_MAPPING: Record<string, InspectionIssueStatus> = {
  OPEN: INSPECTION_ISSUE_STATUS.OPEN,
  开启: INSPECTION_ISSUE_STATUS.OPEN,
  待处理: INSPECTION_ISSUE_STATUS.OPEN,

  IN_PROGRESS: INSPECTION_ISSUE_STATUS.IN_PROGRESS,
  'IN PROGRESS': INSPECTION_ISSUE_STATUS.IN_PROGRESS,
  进行中: INSPECTION_ISSUE_STATUS.IN_PROGRESS,
  处理中: INSPECTION_ISSUE_STATUS.IN_PROGRESS,

  CLOSED: INSPECTION_ISSUE_STATUS.CLOSED,
  已关闭: INSPECTION_ISSUE_STATUS.CLOSED,
};

function normalizeInspectionIssueStatusKey(value: unknown): string {
  return String(value ?? '')
    .trim()
    .replaceAll(/\s+/g, '_')
    .toUpperCase();
}

export function mapInspectionIssueStatus(
  value: unknown,
): InspectionIssueStatus {
  const normalized = normalizeInspectionIssueStatusKey(value);
  if (!normalized) {
    return INSPECTION_ISSUE_STATUS.OPEN;
  }

  return (
    INSPECTION_ISSUE_STATUS_MAPPING[normalized] || INSPECTION_ISSUE_STATUS.OPEN
  );
}
