import { WorkOrderStatusEnum } from '#/api/qms/enums';
import { WORK_ORDER_STATUS_UI_MAP } from '../constants';
import type { StatusUIConfig } from '../types/workOrder';

/**
 * 状态映射表（与导入逻辑保持一致）
 * 必须包含：normalizeStatus、IMPORT_STATUS_MAP 中出现的所有变体
 * 映射原则：
 * - OPEN: 未开始/待处理/新工单
 * - IN_PROGRESS: 进行中/处理中
 * - COMPLETED: 已完成/已结束
 * - CANCELLED: 已取消
 */
const STATUS_MAPPING_TABLE: Record<string, WorkOrderStatusEnum> = {
  // 进行中
  'IN_PROGRESS': WorkOrderStatusEnum.IN_PROGRESS,
  'IN PROGRESS': WorkOrderStatusEnum.IN_PROGRESS,
  '进行中': WorkOrderStatusEnum.IN_PROGRESS,
  '处理中': WorkOrderStatusEnum.IN_PROGRESS,
  InProgress: WorkOrderStatusEnum.IN_PROGRESS,
  PROCESSING: WorkOrderStatusEnum.IN_PROGRESS,
  // 已完成
  'COMPLETED': WorkOrderStatusEnum.COMPLETED,
  '已完成': WorkOrderStatusEnum.COMPLETED,
  Completed: WorkOrderStatusEnum.COMPLETED,
  DONE: WorkOrderStatusEnum.COMPLETED,
  '已结束': WorkOrderStatusEnum.COMPLETED,
  // 未开始/待处理 - 统一映射到 OPEN
  'PENDING': WorkOrderStatusEnum.OPEN,
  '未开始': WorkOrderStatusEnum.OPEN,
  Pending: WorkOrderStatusEnum.OPEN,
  'OPEN': WorkOrderStatusEnum.OPEN,
  '待处理': WorkOrderStatusEnum.OPEN,
  // 已取消
  'CANCELLED': WorkOrderStatusEnum.CANCELLED,
  '已取消': WorkOrderStatusEnum.CANCELLED,
  Cancelled: WorkOrderStatusEnum.CANCELLED,
};

/**
 * Normalize status string to WorkOrderStatusEnum
 * @param s 原始状态（可能为 null/undefined/任意字符串）
 * @returns 标准化枚举值（兜底 OPEN）
 */
export function normalizeStatus(
  s: string | null | undefined,
): WorkOrderStatusEnum {
  if (!s) return WorkOrderStatusEnum.OPEN;

  const normalized = String(s).trim();
  const upper = normalized.toUpperCase();

  // 优先匹配映射表（O(1)）
  if (
    STATUS_MAPPING_TABLE[normalized] ||
    STATUS_MAPPING_TABLE[upper]
  ) {
    return (
      STATUS_MAPPING_TABLE[normalized] ||
      STATUS_MAPPING_TABLE[upper]
    );
  }

  // 兜底：匹配枚举本身
  const enumValues = Object.values(WorkOrderStatusEnum);
  return (
    enumValues.find((v) => v.toUpperCase() === upper) ||
    WorkOrderStatusEnum.OPEN
  );
}

/**
 * 获取状态 UI 配置
 * @param s 原始状态（允许 undefined，符合实际数据场景）
 * @returns 完整的 UI 配置对象
 */
export function getStatusInfo(s: string | null | undefined): StatusUIConfig {
  const status = normalizeStatus(s);

  // 安全访问：使用 ?? 而非展开运算符
  const uiConfig = WORK_ORDER_STATUS_UI_MAP[status];

  return {
    color: uiConfig?.color || 'default',
    textKey: uiConfig?.textKey || 'qms.common.unknownStatus',
    defaultText: uiConfig?.defaultText || status,
    icon: uiConfig?.icon || 'lucide:help-circle',
  };
}

/**
 * 类型守卫
 */
export function isValidWorkOrderStatus(s: string): s is WorkOrderStatusEnum {
  return Object.values(WorkOrderStatusEnum).includes(
    s as WorkOrderStatusEnum,
  );
}
