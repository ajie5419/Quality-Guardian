/**
 * 统一售后状态映射工具
 * 严格仅保留“处理中”和“已完成”
 */

export const AFTER_SALES_STATUS = {
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
} as const;

export type AfterSalesStatus =
  (typeof AFTER_SALES_STATUS)[keyof typeof AFTER_SALES_STATUS];

/**
 * 状态映射表 - 严格仅保留用户要求的状态
 */
const STATUS_MAPPING_TABLE: Record<string, AfterSalesStatus> = {
  // 数据库对应值
  [AFTER_SALES_STATUS.IN_PROGRESS]: AFTER_SALES_STATUS.IN_PROGRESS,
  [AFTER_SALES_STATUS.COMPLETED]: AFTER_SALES_STATUS.COMPLETED,

  // 中文对应关系
  处理中: AFTER_SALES_STATUS.IN_PROGRESS,
  已完成: AFTER_SALES_STATUS.COMPLETED,

  // 兼容英文/低版本
  in_progress: AFTER_SALES_STATUS.IN_PROGRESS,
  processing: AFTER_SALES_STATUS.IN_PROGRESS,
  completed: AFTER_SALES_STATUS.COMPLETED,
};

/**
 * 将前端状态映射到数据库 Enum
 * 默认返回处理中
 */
export function mapAfterSalesStatus(
  frontendStatus?: null | string,
): AfterSalesStatus {
  if (!frontendStatus) {
    return AFTER_SALES_STATUS.IN_PROGRESS;
  }

  const normalizedStatus = String(frontendStatus).trim();

  const directMatch = STATUS_MAPPING_TABLE[normalizedStatus];
  if (directMatch) {
    return directMatch;
  }

  const upperStatus = normalizedStatus.toUpperCase();
  const upperMatch = STATUS_MAPPING_TABLE[upperStatus];
  if (upperMatch) {
    return upperMatch;
  }

  // 如果都不匹配，默认返回处理中
  return AFTER_SALES_STATUS.IN_PROGRESS;
}

/**
 * 状态显示颜色映射
 */
export const STATUS_COLOR_MAP: Record<AfterSalesStatus, string> = {
  [AFTER_SALES_STATUS.IN_PROGRESS]: 'blue',
  [AFTER_SALES_STATUS.COMPLETED]: 'green',
};
