/**
 * Supplier API Types
 */

/**
 * Supplier Category
 */
export type SupplierCategory = 'Outsourcing' | 'Supplier' | string;

/**
 * Supplier Status
 */
export type SupplierStatus =
  | 'Disqualified'
  | 'Qualified'
  | 'Warning'
  | string;

/**
 * Supplier Item
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
  // Quality Indicators
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
 * Supplier Statistics
 */
export interface SupplierStats {
  total: number;
  qualified: number;
  warning: number;
  avgScore: number | string;
}

/**
 * Supplier List Query Parameters
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
 * Supplier List Response
 */
export interface SupplierListResponse {
  items: SupplierItem[];
  total: number;
  stats?: SupplierStats;
}

/**
 * Batch Import Supplier Data
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
