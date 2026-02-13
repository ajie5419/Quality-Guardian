/**
 * 统一工单状态映射工具
 * 将前端传递的状态（中英文）映射到数据库 Enum
 */

export const WORK_ORDER_STATUS = {
  OPEN: 'OPEN',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;

export type WorkOrderStatus =
  (typeof WORK_ORDER_STATUS)[keyof typeof WORK_ORDER_STATUS];

/**
 * 前端状态到数据库 Enum 的映射表
 * 支持中文、英文状态值以及数据库 Enum 值
 */
const STATUS_MAPPING_TABLE: Record<string, WorkOrderStatus> = {
  // Database Enum values (direct mapping)
  [WORK_ORDER_STATUS.OPEN]: WORK_ORDER_STATUS.OPEN,
  [WORK_ORDER_STATUS.IN_PROGRESS]: WORK_ORDER_STATUS.IN_PROGRESS,
  [WORK_ORDER_STATUS.COMPLETED]: WORK_ORDER_STATUS.COMPLETED,

  // Open / 未开始 / 待处理
  open: WORK_ORDER_STATUS.OPEN,
  pending: WORK_ORDER_STATUS.OPEN,
  未开始: WORK_ORDER_STATUS.OPEN,
  待处理: WORK_ORDER_STATUS.OPEN,

  // In Progress / 进行中
  in_progress: WORK_ORDER_STATUS.IN_PROGRESS,
  'in progress': WORK_ORDER_STATUS.IN_PROGRESS,
  进行中: WORK_ORDER_STATUS.IN_PROGRESS,

  // Completed / 已完成 / 已结束 / Closed
  completed: WORK_ORDER_STATUS.COMPLETED,
  已完成: WORK_ORDER_STATUS.COMPLETED,
  已结束: WORK_ORDER_STATUS.COMPLETED,
  closed: WORK_ORDER_STATUS.COMPLETED,
  cancelled: WORK_ORDER_STATUS.CANCELLED,
  已取消: WORK_ORDER_STATUS.CANCELLED,
};

/**
 * 将前端状态映射到数据库 Enum
 * @param frontendStatus 前端传递的状态（可以是中文、英文、数据库Enum值、任意大小写）
 * @returns 数据库 Enum 状态
 *
 * @example
 * mapWorkOrderStatus('completed')    // 'COMPLETED'
 * mapWorkOrderStatus('已完成')       // 'COMPLETED'
 * mapWorkOrderStatus('COMPLETED')    // 'COMPLETED' (直接传递Enum值)
 * mapWorkOrderStatus('IN_PROGRESS')  // 'IN_PROGRESS'
 * mapWorkOrderStatus('进行中')       // 'IN_PROGRESS'
 * mapWorkOrderStatus('UNKNOWN')      // 'OPEN' (默认值)
 */
export function mapWorkOrderStatus(frontendStatus?: unknown): WorkOrderStatus {
  if (!frontendStatus) {
    return WORK_ORDER_STATUS.OPEN;
  }

  // 统一转换为小写，忽略空格
  const normalizedStatus = String(frontendStatus)
    .toLowerCase()
    .trim()
    .replaceAll(/\s+/g, '_');

  // 查找映射，如果找不到则默认返回 OPEN
  return STATUS_MAPPING_TABLE[normalizedStatus] || WORK_ORDER_STATUS.OPEN;
}

/**
 * 数据库 Enum 到前端显示文本的映射表
 * 用于列表查询时的状态文本转换
 */
export const DISPLAY_STATUS_MAPPING: Record<WorkOrderStatus, string> = {
  [WORK_ORDER_STATUS.OPEN]: '未开始',
  [WORK_ORDER_STATUS.IN_PROGRESS]: '进行中',
  [WORK_ORDER_STATUS.COMPLETED]: '已完成',
  [WORK_ORDER_STATUS.CANCELLED]: '已取消',
};

/**
 * 将数据库 Enum 转换为前端显示文本
 * @param dbStatus 数据库 Enum 状态
 * @returns 前端显示文本
 */
export function mapToDisplayStatus(dbStatus?: null | string): string {
  if (!dbStatus) return DISPLAY_STATUS_MAPPING[WORK_ORDER_STATUS.OPEN];
  return DISPLAY_STATUS_MAPPING[dbStatus as WorkOrderStatus] || dbStatus;
}
