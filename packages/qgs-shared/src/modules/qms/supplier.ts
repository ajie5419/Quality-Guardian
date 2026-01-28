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
export type SupplierStatus = 'Disqualified' | 'Qualified' | 'Warning' | string;

/**
 * Supplier Item
 */
export interface SupplierItem {
  afterSalesIssueCount?: number;
  brand: string;
  buyer: string;
  category: SupplierCategory;
  createdAt?: string;
  engineeringIssueCount?: number;
  id: string;
  incomingBatchCount?: number;
  incomingQualifiedRate?: number;
  incomingTotalQuantity?: number;
  isWarning?: boolean;
  level?: string;
  name: string;
  origin: string;
  productName: string;
  project: string;
  // Quality Indicators
  qualityScore?: number;
  rating?: string;
  score2025: number;
  status?: SupplierStatus;
  totalAfterSalesLoss?: number;
  totalEngineeringLoss?: number;
  updatedAt?: string;
  warningReasons?: string[];
}

/**
 * Supplier Statistics
 */
export interface SupplierStats {
  avgScore: number | string;
  qualified: number;
  total: number;
  warning: number;
}

/**
 * Supplier List Query Parameters
 */
export interface SupplierListParams {
  category?: SupplierCategory;
  keyword?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  status?: SupplierStatus;
}

/**
 * Supplier List Response
 */
export interface SupplierListResponse {
  items: SupplierItem[];
  stats?: SupplierStats;
  total: number;
}

/**
 * Batch Import Supplier Data
 */
export interface ImportSupplierItem {
  brand?: string;
  buyer?: string;
  category?: SupplierCategory;
  name: string;
  origin?: string;
  productName?: string;
  project?: string;
  status?: SupplierStatus;
}
