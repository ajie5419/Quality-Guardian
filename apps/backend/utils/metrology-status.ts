const INSPECTION_STATUS_LABELS = {
  DISABLED: '停用',
  EXPIRED: '超期',
  PENDING: '待检',
  VALID: '在检',
} as const;

const BORROW_STATUS_LABELS = {
  AVAILABLE: '未借出',
  BORROWED: '已借出',
  RETURN_PENDING: '待确认归还',
} as const;

export type MetrologyInspectionStatus = keyof typeof INSPECTION_STATUS_LABELS;
export type MetrologyBorrowStatus = keyof typeof BORROW_STATUS_LABELS;

export function formatMetrologyDate(value: Date | null | string | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

export function startOfToday() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
}

export function calculateRemainingDays(validUntil: Date | null) {
  if (!validUntil) return null;
  const diff = validUntil.getTime() - startOfToday().getTime();
  return Math.ceil(diff / (24 * 60 * 60 * 1000));
}

/**
 * 检验状态需要统一在后端派生，避免台账、借用、计划三个模块各自判断后口径漂移。
 */
export function deriveMetrologyInspectionStatus(
  rawStatus: null | string | undefined,
  validUntil: Date | null,
): MetrologyInspectionStatus {
  const remainingDays = calculateRemainingDays(validUntil);
  const statusText = String(rawStatus || '')
    .trim()
    .toUpperCase();

  if (
    statusText === 'DISABLED' ||
    rawStatus === '停用' ||
    rawStatus === '禁用'
  ) {
    return 'DISABLED';
  }

  if (remainingDays === null) {
    return 'PENDING';
  }

  if (remainingDays < 0) {
    return 'EXPIRED';
  }

  if (remainingDays <= 30) {
    return 'PENDING';
  }

  return 'VALID';
}

export function getMetrologyInspectionStatusLabel(
  status: MetrologyInspectionStatus,
) {
  return INSPECTION_STATUS_LABELS[status];
}

export function normalizeMetrologyBorrowStatus(
  rawStatus: null | string | undefined,
): MetrologyBorrowStatus {
  const status = String(rawStatus || '')
    .trim()
    .toUpperCase();

  if (status === 'BORROWED' || status === 'RETURN_PENDING') {
    return status;
  }

  return 'AVAILABLE';
}

export function getMetrologyBorrowStatusLabel(status: MetrologyBorrowStatus) {
  return BORROW_STATUS_LABELS[status];
}
