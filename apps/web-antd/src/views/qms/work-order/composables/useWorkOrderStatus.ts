import type { StatusUIConfig } from '../types/workOrder';

import { mapWorkOrderStatus } from '@qgs/domain';
import { WorkOrderStatusEnum } from '@qgs/enums';

import { WORK_ORDER_STATUS_UI_MAP } from '../constants';

/**
 * Normalize status string to WorkOrderStatusEnum
 * @param s 原始状态（可能为 null/undefined/任意字符串）
 * @returns 标准化枚举值（兜底 OPEN）
 */
export function normalizeStatus(
  s: null | string | undefined,
): WorkOrderStatusEnum {
  return mapWorkOrderStatus(s) as WorkOrderStatusEnum;
}

/**
 * 获取状态 UI 配置
 * @param s 原始状态（允许 undefined，符合实际数据场景）
 * @returns 完整的 UI 配置对象
 */
export function getStatusInfo(s: null | string | undefined): StatusUIConfig {
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
  return Object.values(WorkOrderStatusEnum).includes(s as WorkOrderStatusEnum);
}
