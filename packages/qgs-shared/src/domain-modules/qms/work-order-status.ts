/**
 * Canonical work-order status mapping rules shared by backend and frontend.
 */
export const WORK_ORDER_STATUS = {
  OPEN: 'OPEN',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;

export type WorkOrderStatus =
  (typeof WORK_ORDER_STATUS)[keyof typeof WORK_ORDER_STATUS];

const STATUS_MAPPING_TABLE: Record<string, WorkOrderStatus> = {
  [WORK_ORDER_STATUS.OPEN]: WORK_ORDER_STATUS.OPEN,
  [WORK_ORDER_STATUS.IN_PROGRESS]: WORK_ORDER_STATUS.IN_PROGRESS,
  [WORK_ORDER_STATUS.COMPLETED]: WORK_ORDER_STATUS.COMPLETED,

  open: WORK_ORDER_STATUS.OPEN,
  pending: WORK_ORDER_STATUS.OPEN,
  未开始: WORK_ORDER_STATUS.OPEN,
  待处理: WORK_ORDER_STATUS.OPEN,

  in_progress: WORK_ORDER_STATUS.IN_PROGRESS,
  'in progress': WORK_ORDER_STATUS.IN_PROGRESS,
  进行中: WORK_ORDER_STATUS.IN_PROGRESS,

  completed: WORK_ORDER_STATUS.COMPLETED,
  已完成: WORK_ORDER_STATUS.COMPLETED,
  已结束: WORK_ORDER_STATUS.COMPLETED,
  closed: WORK_ORDER_STATUS.COMPLETED,
  cancelled: WORK_ORDER_STATUS.CANCELLED,
  已取消: WORK_ORDER_STATUS.CANCELLED,
};

export const DISPLAY_STATUS_MAPPING: Record<WorkOrderStatus, string> = {
  [WORK_ORDER_STATUS.OPEN]: '未开始',
  [WORK_ORDER_STATUS.IN_PROGRESS]: '进行中',
  [WORK_ORDER_STATUS.COMPLETED]: '已完成',
  [WORK_ORDER_STATUS.CANCELLED]: '已取消',
};

export function mapWorkOrderStatus(frontendStatus?: unknown): WorkOrderStatus {
  if (!frontendStatus) {
    return WORK_ORDER_STATUS.OPEN;
  }

  const normalizedStatus = String(frontendStatus)
    .toLowerCase()
    .trim()
    .replaceAll(/\s+/g, '_');

  return STATUS_MAPPING_TABLE[normalizedStatus] || WORK_ORDER_STATUS.OPEN;
}

export function mapToDisplayStatus(dbStatus?: null | string): string {
  if (!dbStatus) return DISPLAY_STATUS_MAPPING[WORK_ORDER_STATUS.OPEN];
  return DISPLAY_STATUS_MAPPING[dbStatus as WorkOrderStatus] || dbStatus;
}
