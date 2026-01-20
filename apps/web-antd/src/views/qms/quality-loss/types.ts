import type { QualityLossStatusEnum } from '#/api/qms/enums';

/**
 * 损失来源枚举
 */
export enum LossSource {
  INTERNAL = 'Internal',
  EXTERNAL = 'External',
  MANUAL = 'Manual',
}

/**
 * 损失类型枚举
 */
export enum LossType {
  SCRAP = 'Scrap',
  REWORK = 'Rework',
  RETURN = 'Return',
  TRANSPORT = 'Transport',
  OTHER = 'Other',
}

/**
 * 统计数据接口
 */
export interface LossStatistics {
  totalAmount: number;
  totalClaim: number;
  recoveryRate: string;
  pendingAmount: number;
}

import type { SystemDeptApi } from '#/api/system/dept';

/**
 * 部门节点别名
 */
export type DeptNode = SystemDeptApi.Dept;
