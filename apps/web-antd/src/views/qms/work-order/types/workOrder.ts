/**
 * Work Order Import Types
 */

import type { TreeSelectNode } from '#/types';

/** 导入参数接口 */
export interface ImportParams {
  file: File;
}

/** 导入行数据类型 */
export interface WorkOrderImportRow {
  workOrderNumber?: string;
  customerName?: string;
  projectName?: string;
  division?: string;
  quantity?: number;
  status?: string;
  deliveryDate?: string;
  effectiveTime?: string;
}

/** 导入响应类型 */
export interface ImportResponse {
  successCount: number;
  failCount: number;
  failItems?: Array<{
    reason: string;
    workOrderNumber: string;
  }>;
}

/** 状态 UI 配置类型 */
export interface StatusUIConfig {
  color: string;
  textKey: string;
  defaultText: string;
  icon?: string;
}

/**
 * 工单记录类型（基于 Prisma work_orders 模型）
 *
 * 注意：前端 WorkOrderItem 来自 @qgs/shared 包
 * 此类型用于 Modal 内部类型安全，确保字段类型正确
 */
export interface WorkOrderRecord {
  workOrderNumber: string;
  customerName: string;
  projectName?: null | string;
  division?: null | string;
  quantity: number;
  deliveryDate: string; // ISO 日期字符串
  status: string; // 前端接收的原始字符串，由 normalizeStatus 转换
  createdAt?: string;
  updatedAt?: string;
  version?: number;
  isDeleted?: boolean;
  effectiveTime?: null | string;
}

/** Modal 打开参数类型 */
export interface OpenParams {
  record?: null | WorkOrderRecord;
  deptData?: TreeSelectNode[];
}
