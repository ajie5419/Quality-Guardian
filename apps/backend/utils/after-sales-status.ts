import type { after_sales_claimStatus } from '@prisma/client';

/**
 * 统一售后状态映射工具（覆盖数据库完整枚举）
 */

export const AFTER_SALES_STATUS = {
  CANCELLED: 'CANCELLED',
  CLOSED: 'CLOSED',
  COMPLETED: 'COMPLETED',
  IN_PROGRESS: 'IN_PROGRESS',
  NEGOTIATING: 'NEGOTIATING',
  OPEN: 'OPEN',
  RESOLVED: 'RESOLVED',
  SUBMITTED: 'SUBMITTED',
} as const;

export type AfterSalesStatus = after_sales_claimStatus;

/**
 * 状态映射表
 */
const STATUS_MAPPING_TABLE: Record<string, AfterSalesStatus> = {
  // 数据库对应值
  [AFTER_SALES_STATUS.OPEN]: AFTER_SALES_STATUS.OPEN,
  [AFTER_SALES_STATUS.IN_PROGRESS]: AFTER_SALES_STATUS.IN_PROGRESS,
  [AFTER_SALES_STATUS.SUBMITTED]: AFTER_SALES_STATUS.SUBMITTED,
  [AFTER_SALES_STATUS.NEGOTIATING]: AFTER_SALES_STATUS.NEGOTIATING,
  [AFTER_SALES_STATUS.RESOLVED]: AFTER_SALES_STATUS.RESOLVED,
  [AFTER_SALES_STATUS.COMPLETED]: AFTER_SALES_STATUS.COMPLETED,
  [AFTER_SALES_STATUS.CLOSED]: AFTER_SALES_STATUS.CLOSED,
  [AFTER_SALES_STATUS.CANCELLED]: AFTER_SALES_STATUS.CANCELLED,

  // 中文对应关系
  待处理: AFTER_SALES_STATUS.OPEN,
  处理中: AFTER_SALES_STATUS.IN_PROGRESS,
  已提交: AFTER_SALES_STATUS.SUBMITTED,
  协商中: AFTER_SALES_STATUS.NEGOTIATING,
  已解决: AFTER_SALES_STATUS.RESOLVED,
  已完成: AFTER_SALES_STATUS.COMPLETED,
  已结束: AFTER_SALES_STATUS.COMPLETED,
  已完结: AFTER_SALES_STATUS.COMPLETED,
  已关闭: AFTER_SALES_STATUS.CLOSED,
  已取消: AFTER_SALES_STATUS.CANCELLED,

  // 兼容英文/低版本
  open: AFTER_SALES_STATUS.OPEN,
  pending: AFTER_SALES_STATUS.OPEN,
  in_progress: AFTER_SALES_STATUS.IN_PROGRESS,
  processing: AFTER_SALES_STATUS.IN_PROGRESS,
  submitted: AFTER_SALES_STATUS.SUBMITTED,
  negotiating: AFTER_SALES_STATUS.NEGOTIATING,
  resolved: AFTER_SALES_STATUS.RESOLVED,
  completed: AFTER_SALES_STATUS.COMPLETED,
  closed: AFTER_SALES_STATUS.CLOSED,
  cancelled: AFTER_SALES_STATUS.CANCELLED,
};

/**
 * 将前端状态映射到数据库 Enum，默认返回 OPEN
 */
export function mapAfterSalesStatus(
  frontendStatus?: null | string,
): AfterSalesStatus {
  if (!frontendStatus) {
    return AFTER_SALES_STATUS.OPEN;
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

  // 如果都不匹配，默认返回 OPEN
  return AFTER_SALES_STATUS.OPEN;
}

/**
 * 状态显示颜色映射
 */
export const STATUS_COLOR_MAP: Record<AfterSalesStatus, string> = {
  [AFTER_SALES_STATUS.OPEN]: 'orange',
  [AFTER_SALES_STATUS.IN_PROGRESS]: 'blue',
  [AFTER_SALES_STATUS.SUBMITTED]: 'cyan',
  [AFTER_SALES_STATUS.NEGOTIATING]: 'purple',
  [AFTER_SALES_STATUS.RESOLVED]: 'green',
  [AFTER_SALES_STATUS.COMPLETED]: 'green',
  [AFTER_SALES_STATUS.CLOSED]: 'gray',
  [AFTER_SALES_STATUS.CANCELLED]: 'red',
};
