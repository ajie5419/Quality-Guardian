/**
 * QMS Business Logic Enums
 */

/**
 * QMS Supplier Status
 */
export enum SupplierStatusEnum {
  FROZEN = 'Frozen',
  OBSERVATION = 'Observation',
  QUALIFIED = 'Qualified',
}

/**
 * QMS Work Order Status
 * MUST match backend work_orders_status enum
 */
export enum WorkOrderStatusEnum {
  CANCELLED = 'CANCELLED',
  COMPLETED = 'COMPLETED',
  IN_PROGRESS = 'IN_PROGRESS',
  OPEN = 'OPEN',
}

/**
 * QMS Inspection Issue Status
 */
export enum InspectionIssueStatusEnum {
  CLOSED = 'CLOSED',
  IN_PROGRESS = 'IN_PROGRESS',
  OPEN = 'OPEN',
}

/**
 * QMS Quality Loss Status
 */
export enum QualityLossStatusEnum {
  CONFIRMED = 'Confirmed',
  PENDING = 'Pending',
  PROCESSING = 'Processing',
  RESOLVED = 'Resolved',
}

/**
 * QMS Project Status (Planning)
 */
export enum ProjectStatusEnum {
  ACTIVE = 'active',
  ARCHIVED = 'archived',
}
