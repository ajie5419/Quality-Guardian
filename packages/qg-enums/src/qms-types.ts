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

export enum SupplierStatusEnum {
  FROZEN = 'Frozen',
  OBSERVATION = 'Observation',
  QUALIFIED = 'Qualified',
  TRIAL = 'Trial',
}

export enum WorkOrderStatusEnum {
  CANCELLED = 'CANCELLED',
  COMPLETED = 'COMPLETED',
  IN_PROGRESS = 'IN_PROGRESS',
  OPEN = 'OPEN',
}

export enum InspectionIssueStatusEnum {
  CLOSED = 'CLOSED',
  IN_PROGRESS = 'IN_PROGRESS',
  OPEN = 'OPEN',
}

export enum QualityLossStatusEnum {
  CONFIRMED = 'Confirmed',
  PENDING = 'Pending',
  PROCESSING = 'Processing',
  RESOLVED = 'Resolved',
}

export enum ProjectStatusEnum {
  ACTIVE = 'active',
  ARCHIVED = 'archived',
}

export const INSPECTION_ISSUE_DEPT_TYPE_KEYWORDS = {
  OUTSOURCED: ISSUE_DEPT_TYPE.OUTSOURCED,
  PRODUCTION: ISSUE_DEPT_TYPE.PRODUCTION,
  PURCHASE: ISSUE_DEPT_TYPE.PURCHASE,
} as const;

export const INSPECTION_ISSUE_SEVERITY_OPTIONS = [
  { color: 'blue', label: '轻微', value: ISSUE_SEVERITY.MINOR },
  { color: 'orange', label: '严重', value: ISSUE_SEVERITY.MAJOR },
  { color: 'red', label: '重大', value: ISSUE_SEVERITY.CRITICAL },
] as const;

export const INSPECTION_ISSUE_CLAIM_OPTIONS = [
  { label: '是', value: CLAIM_STATUS.YES },
  { label: '否', value: CLAIM_STATUS.NO },
] as const;

export const INSPECTION_ISSUE_DEFAULT_VALUES = {
  DEFAULT_CLAIM: CLAIM_STATUS.NO,
  DEFAULT_DEFECT_SUBTYPE: '加工精度缺陷',
  DEFAULT_DEFECT_TYPE: '制造缺陷',
  DEFAULT_QUANTITY: 1,
  DEFAULT_SEVERITY: ISSUE_SEVERITY.MINOR,
  DEFAULT_STATUS: InspectionIssueStatusEnum.OPEN,
} as const;

export const INSPECTION_ISSUE_STATUS_UI_MAP = {
  [InspectionIssueStatusEnum.CLOSED]: { color: 'green', label: '已关闭' },
  [InspectionIssueStatusEnum.IN_PROGRESS]: {
    color: 'orange',
    label: '处理中',
  },
  [InspectionIssueStatusEnum.OPEN]: { color: 'red', label: '待处理' },
} as const;
