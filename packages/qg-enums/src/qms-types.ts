export const LOSS_SOURCE = {
  COMMISSIONING: 'Commissioning',
  EXTERNAL: 'External',
  INTERNAL: 'Internal',
  MANUAL: 'Manual',
} as const;

export type LossSource = (typeof LOSS_SOURCE)[keyof typeof LOSS_SOURCE];

export const LOSS_TYPE = {
  OTHER: 'Other',
  RETURN: 'Return',
  REWORK: 'Rework',
  SCRAP: 'Scrap',
  TRANSPORT: 'Transport',
} as const;

export type LossType = (typeof LOSS_TYPE)[keyof typeof LOSS_TYPE];

export const CLAIM_STATUS = {
  NO: 'No',
  YES: 'Yes',
} as const;

export type ClaimStatus = (typeof CLAIM_STATUS)[keyof typeof CLAIM_STATUS];

export const ISSUE_SEVERITY = {
  CRITICAL: 'Critical',
  MAJOR: 'Major',
  MINOR: 'Minor',
} as const;

export type IssueSeverity =
  (typeof ISSUE_SEVERITY)[keyof typeof ISSUE_SEVERITY];

export const ISSUE_DEPT_TYPE = {
  OUTSOURCED: '外协',
  PRODUCTION: '履约',
  PURCHASE: '采购',
} as const;

export type IssueDeptType =
  (typeof ISSUE_DEPT_TYPE)[keyof typeof ISSUE_DEPT_TYPE];

export const ISSUE_DEFECT_TYPE = {
  DESIGN: '设计缺陷',
  MANUFACTURING: '制造缺陷',
  OTHER: '其他缺陷',
  PART: '零部件缺陷',
  PROCESS: '工艺缺陷',
} as const;

export type IssueDefectType =
  (typeof ISSUE_DEFECT_TYPE)[keyof typeof ISSUE_DEFECT_TYPE];

export const SUPPLIER_CATEGORY = {
  OUTSOURCING: 'Outsourcing',
  PRODUCTION: 'ProductionUnit',
  SUPPLIER: 'Supplier',
} as const;

export type SupplierCategory =
  (typeof SUPPLIER_CATEGORY)[keyof typeof SUPPLIER_CATEGORY];

export const INSPECTION_RECORD_TYPE = {
  INCOMING: 'INCOMING',
  PROCESS: 'PROCESS',
  SHIPMENT: 'SHIPMENT',
} as const;

export type InspectionRecordType =
  (typeof INSPECTION_RECORD_TYPE)[keyof typeof INSPECTION_RECORD_TYPE];
