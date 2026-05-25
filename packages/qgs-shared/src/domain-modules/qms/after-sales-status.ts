/**
 * Canonical after-sales status rules shared by backend and frontend.
 */
export const AFTER_SALES_STATUS = {
  OPEN: 'OPEN',
  IN_PROGRESS: 'IN_PROGRESS',
  SUBMITTED: 'SUBMITTED',
  NEGOTIATING: 'NEGOTIATING',
  RESOLVED: 'RESOLVED',
  COMPLETED: 'COMPLETED',
  CLOSED: 'CLOSED',
  CANCELLED: 'CANCELLED',
} as const;

export type AfterSalesStatus =
  (typeof AFTER_SALES_STATUS)[keyof typeof AFTER_SALES_STATUS];

const AFTER_SALES_STATUS_MAPPING_TABLE: Record<string, AfterSalesStatus> = {
  OPEN: AFTER_SALES_STATUS.OPEN,
  PENDING: AFTER_SALES_STATUS.OPEN,
  待处理: AFTER_SALES_STATUS.OPEN,

  IN_PROGRESS: AFTER_SALES_STATUS.IN_PROGRESS,
  'IN PROGRESS': AFTER_SALES_STATUS.IN_PROGRESS,
  PROCESSING: AFTER_SALES_STATUS.IN_PROGRESS,
  处理中: AFTER_SALES_STATUS.IN_PROGRESS,

  SUBMITTED: AFTER_SALES_STATUS.SUBMITTED,
  已提交: AFTER_SALES_STATUS.SUBMITTED,

  NEGOTIATING: AFTER_SALES_STATUS.NEGOTIATING,
  协商中: AFTER_SALES_STATUS.NEGOTIATING,

  RESOLVED: AFTER_SALES_STATUS.RESOLVED,
  已解决: AFTER_SALES_STATUS.RESOLVED,

  COMPLETED: AFTER_SALES_STATUS.COMPLETED,
  已完成: AFTER_SALES_STATUS.COMPLETED,
  已结束: AFTER_SALES_STATUS.COMPLETED,
  已完结: AFTER_SALES_STATUS.COMPLETED,

  CLOSED: AFTER_SALES_STATUS.CLOSED,
  已关闭: AFTER_SALES_STATUS.CLOSED,

  CANCELLED: AFTER_SALES_STATUS.CANCELLED,
  已取消: AFTER_SALES_STATUS.CANCELLED,
};

const KNOWN_AFTER_SALES_STATUS_KEYS = new Set(
  Object.keys(AFTER_SALES_STATUS_MAPPING_TABLE).map((key) =>
    String(key).trim().replaceAll(/\s+/g, '_').toUpperCase(),
  ),
);

export const AFTER_SALES_STATUS_COLOR_MAP: Record<AfterSalesStatus, string> = {
  [AFTER_SALES_STATUS.OPEN]: 'orange',
  [AFTER_SALES_STATUS.IN_PROGRESS]: 'blue',
  [AFTER_SALES_STATUS.SUBMITTED]: 'cyan',
  [AFTER_SALES_STATUS.NEGOTIATING]: 'purple',
  [AFTER_SALES_STATUS.RESOLVED]: 'green',
  [AFTER_SALES_STATUS.COMPLETED]: 'green',
  [AFTER_SALES_STATUS.CLOSED]: 'gray',
  [AFTER_SALES_STATUS.CANCELLED]: 'red',
};

export const AFTER_SALES_IMPORT_STATUS_MAP: Record<string, AfterSalesStatus> = {
  待处理: AFTER_SALES_STATUS.OPEN,
  处理中: AFTER_SALES_STATUS.IN_PROGRESS,
  已提交: AFTER_SALES_STATUS.SUBMITTED,
  协商中: AFTER_SALES_STATUS.NEGOTIATING,
  已解决: AFTER_SALES_STATUS.RESOLVED,
  已结束: AFTER_SALES_STATUS.COMPLETED,
  已完结: AFTER_SALES_STATUS.COMPLETED,
  已完成: AFTER_SALES_STATUS.COMPLETED,
  已关闭: AFTER_SALES_STATUS.CLOSED,
  已取消: AFTER_SALES_STATUS.CANCELLED,
};

function normalizeAfterSalesStatusKey(value: unknown): string {
  return String(value ?? '')
    .trim()
    .replaceAll(/\s+/g, '_')
    .toUpperCase();
}

export function mapAfterSalesStatus(status: unknown): AfterSalesStatus {
  const normalized = normalizeAfterSalesStatusKey(status);
  if (!normalized) {
    return AFTER_SALES_STATUS.OPEN;
  }

  return (
    AFTER_SALES_STATUS_MAPPING_TABLE[normalized] || AFTER_SALES_STATUS.OPEN
  );
}

export function isKnownAfterSalesStatusInput(value: unknown): boolean {
  const normalized = normalizeAfterSalesStatusKey(value);
  if (!normalized) {
    return false;
  }
  return KNOWN_AFTER_SALES_STATUS_KEYS.has(normalized);
}
