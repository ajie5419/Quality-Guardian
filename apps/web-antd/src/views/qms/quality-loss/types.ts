/**
 * 损失来源枚举
 */
import type { Dept } from '@qgs/shared';

export enum LossSource {
  EXTERNAL = 'External',
  INTERNAL = 'Internal',
  MANUAL = 'Manual',
}

/**
 * 损失类型枚举
 */
export enum LossType {
  OTHER = 'Other',
  RETURN = 'Return',
  REWORK = 'Rework',
  SCRAP = 'Scrap',
  TRANSPORT = 'Transport',
}

/**
 * 统计数据接口
 */
export interface LossStatistics {
  totalAmount: number;
  totalClaim: number;
  recoveryRate: number;
  displayRate: string;
  pendingAmount: number;
}

/**
 * 部门节点别名
 */
export type DeptNode = Dept;
