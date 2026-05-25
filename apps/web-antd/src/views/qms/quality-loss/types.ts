import type { Dept } from '@qgs/shared';

/**
 * 损失来源枚举
 */
import { LOSS_SOURCE, LOSS_TYPE } from '@qgs/shared';

/**
 * 损失类型枚举
 */
export const LossSource = LOSS_SOURCE;
export type LossSource = (typeof LossSource)[keyof typeof LossSource];

export const LossType = LOSS_TYPE;
export type LossType = (typeof LossType)[keyof typeof LossType];

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
