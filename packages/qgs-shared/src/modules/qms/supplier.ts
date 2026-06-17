/**
 * Supplier API Types
 */

/**
 * Supplier Category
 */
type SupplierCategory = 'Outsourcing' | 'Supplier' | string;
export type OutsourcingMode =
  | 'EXTERNAL_PROCESSOR'
  | 'EXTERNAL_SERVICE'
  | 'IN_HOUSE_TEAM'
  | string;

/**
 * Supplier Status
 */
export type SupplierStatus = 'Disqualified' | 'Qualified' | 'Warning' | string;

export const SUPPLIER_LIST_SORT_KEYS = [
  'afterSalesIssueCount',
  'brand',
  'buyer',
  'category',
  'createdAt',
  'engineeringIssueCount',
  'incomingQualifiedRate',
  'level',
  'manufacturerNature',
  'name',
  'outsourcingMode',
  'phone',
  'productName',
  'qualityScore',
  'rating',
  'recognizedAt',
  'status',
  'updatedAt',
] as const;

export type SupplierListSortKey = (typeof SUPPLIER_LIST_SORT_KEYS)[number];

/**
 * Supplier Item
 */
export interface SupplierItem {
  admissionDocuments?: unknown;
  afterSalesIssueCount?: number;
  afterSalesScore?: number;
  brand: string;
  buyer: string;
  category: SupplierCategory;
  createdAt?: string;
  engineeringIssueCount?: number;
  engineeringScore?: number;
  id: string;
  incomingBatchCount?: number;
  incomingQualifiedRate?: number;
  incomingScore?: number;
  incomingTotalQuantity?: number;
  isWarning?: boolean;
  level?: string;
  manufacturerNature?: string;
  name: string;
  origin: string;
  outsourcingMode?: OutsourcingMode;
  productName: string;
  project: string;
  // Quality Indicators
  qualityScore?: number;
  rating?: string;
  recognizedAt?: string;
  score2025: number;
  scoringModel?: 'IN_HOUSE_OUTSOURCING' | 'SUPPLIER' | string;
  stabilityScore?: number;
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
  outsourcingMode?: OutsourcingMode;
  page?: number;
  pageSize?: number;
  sortBy?: string | SupplierListSortKey;
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
  admissionDocuments?: unknown;
  brand?: string;
  buyer?: string;
  category?: SupplierCategory;
  manufacturerNature?: string;
  name: string;
  origin?: string;
  outsourcingMode?: OutsourcingMode;
  productName?: string;
  project?: string;
  recognizedAt?: string;
  status?: SupplierStatus;
}
