/**
 * QMS Business Logic Enums
 */

/**
 * QMS Supplier Status
 */
export enum SupplierStatusEnum {
  QUALIFIED = 'Qualified',
  OBSERVATION = 'Observation',
  FROZEN = 'Frozen',
}

/**
 * QMS Work Order Status
 */
export enum WorkOrderStatusEnum {
  PENDING = 'Pending',
  IN_PROGRESS = 'In Progress',
  COMPLETED = 'Completed',
  CLOSED = 'Closed',
}

/**
 * QMS Inspection Issue Status
 */
export enum InspectionIssueStatusEnum {
  OPEN = 'OPEN',
  IN_PROGRESS = 'IN_PROGRESS',
  CLOSED = 'CLOSED',
}

/**
 * QMS Quality Loss Status
 */
export enum QualityLossStatusEnum {
  PENDING = 'Pending',
  PROCESSING = 'Processing',
  CONFIRMED = 'Confirmed',
  RESOLVED = 'Resolved',
}

/**
 * QMS Project Status (Planning)
 */
export enum ProjectStatusEnum {
  ACTIVE = 'active',
  ARCHIVED = 'archived',
}
