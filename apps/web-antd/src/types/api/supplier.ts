/**
 * Supplier API 类型定义
 */

export namespace QmsSupplierApi {
  /**
   * 供应商类别
   */
  export type SupplierCategory = 'Outsourcing' | 'Supplier' | string;

  /**
   * 供应商状态
   */
  export type SupplierStatus =
    | 'Disqualified'
    | 'Qualified'
    | 'Warning'
    | string;

  /**
   * 供应商项目
   */
  export interface SupplierItem {
    id: string;
    category: SupplierCategory;
    name: string;
    productName: string;
    brand: string;
    origin: string;
    project: string;
    buyer: string;
    score2025: number;
    status?: SupplierStatus;
    createdAt?: string;
    updatedAt?: string;
    // 质量指标
    qualityScore?: number;
    incomingBatchCount?: number;
    incomingTotalQuantity?: number;
    incomingQualifiedRate?: number;
    totalEngineeringLoss?: number;
    totalAfterSalesLoss?: number;
    level?: string;
    rating?: string;
    isWarning?: boolean;
    warningReasons?: string[];
    engineeringIssueCount?: number;
    afterSalesIssueCount?: number;
  }

  /**
   * 供应商统计数据
   */
  export interface SupplierStats {
    total: number;
    qualified: number;
    warning: number;
    avgScore: number | string;
  }

  /**
   * 供应商列表查询参数
   */
  export interface SupplierListParams {
    page?: number;
    pageSize?: number;
    category?: SupplierCategory;
    status?: SupplierStatus;
    keyword?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }

  /**
   * 供应商列表响应
   */
  export interface SupplierListResponse {
    items: SupplierItem[];
    total: number;
    stats?: SupplierStats;
  }

  /**
   * 批量导入的供应商数据
   */
  export interface ImportSupplierItem {
    name: string;
    brand?: string;
    category?: SupplierCategory;
    productName?: string;
    buyer?: string;
    status?: SupplierStatus;
    origin?: string;
    project?: string;
  }
}
