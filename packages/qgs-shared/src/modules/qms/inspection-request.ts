import type { InspectionIssueResponsibilityType } from '../../domain-modules/qms/inspection-request';

export type InspectionRequestStatus =
  | 'CANCELLED'
  | 'CLOSED'
  | 'DISPATCHED'
  | 'INSPECTING'
  | 'SUBMITTED';

export type InspectionRequestCheckResult = 'FAIL' | 'NA' | 'PASS';

export type InspectionRequestInspectionResult =
  | 'CONDITIONAL'
  | 'FAIL'
  | 'NA'
  | 'PASS';

export type InspectionMaterialApprovalStatus =
  | 'APPROVED'
  | 'PENDING'
  | 'REJECTED';

export type InspectionMaterialResolutionMode = 'CREATE' | 'LINK_EXISTING';

export type InspectionRequestDispatchBlockedReason =
  | 'MATERIAL_APPROVAL_PENDING'
  | 'MATERIAL_APPROVAL_REJECTED';

export type InspectionStationSelectionMode = 'ALL' | 'PARTIAL';

export interface InspectionRequestAttachment {
  fileId?: string;
  name: string;
  size?: number;
  type?: string;
  url: string;
}

export interface InspectionStationSelection {
  indexes: number[];
  mode: InspectionStationSelectionMode;
}

export interface InspectionRequestIssueResponsibility {
  responsibilityType: InspectionIssueResponsibilityType;
  responsibleDepartment: string;
  /** Null means the request context is incomplete or ambiguous and cannot create an issue. */
  responsibleDepartmentId: null | string;
  supplierId: null | string;
  supplierName: string;
}

export type InspectionRequestTeamResolution =
  | 'external'
  | 'internal'
  | 'unresolved';

export type InspectionRequestTeamResolutionReason =
  | 'AMBIGUOUS_DEPARTMENT_SOURCE'
  | 'CONFLICTING_TEAM_SOURCES'
  | 'INACTIVE_DEPARTMENT_SOURCE'
  | 'INVALID_EXTERNAL_SUPPLIER_MAPPING'
  | 'MISSING_RESPONSIBILITY_SOURCE';

export interface InspectionRequestTeamOption {
  group: InspectionRequestTeamResolution;
  label: string;
  reason?: InspectionRequestTeamResolutionReason;
  responsibleDepartmentId?: string;
  supplierId?: string;
  value: string;
}

export interface InspectionRequestResponsibilityDepartmentOption {
  label: string;
  value: string;
}

export interface InspectionRequestResponsibilitySupplierOption {
  label: string;
  value: string;
}

export interface InspectionRequestResponsibilityOptions {
  departments: InspectionRequestResponsibilityDepartmentOption[];
  responsibilityType: InspectionIssueResponsibilityType;
  suppliers: InspectionRequestResponsibilitySupplierOption[];
}

export interface InspectionRequest {
  attachments?: InspectionRequestAttachment[];
  category?: 'INCOMING' | 'PROCESS';
  closeAttachments?: InspectionRequestAttachment[];
  closedAt?: null | string;
  closeRemark?: null | string;
  componentName?: null | string;
  createdAt: string;
  dispatchBlockedReason?: InspectionRequestDispatchBlockedReason | null;
  dispatchedAt?: null | string;
  dispatcherId?: null | string;
  dispatcherName?: null | string;
  dispatchRemark?: null | string;
  dispatchTaskId?: null | string;
  id: string;
  inspectionId?: null | string;
  inspectionResult?: InspectionRequestInspectionResult;
  inspectorId?: null | string;
  inspectorName?: null | string;
  issueResponsibility?: InspectionRequestIssueResponsibility;
  linkedIssueId?: null | string;
  linkedIssueNo?: null | string;
  linkedIssueStatus?: null | string;
  materialApprovalStatus?: InspectionMaterialApprovalStatus | null;
  materialRequestId?: null | string;
  mutualCheckResult: InspectionRequestCheckResult;
  partId?: null | string;
  partName: string;
  priority: number;
  processId?: null | string;
  processName: string;
  qualifiedQuantity?: null | number;
  quantity: number;
  reporter: string;
  requestedPartName?: null | string;
  requestInfo?: null | string;
  requestNo: string;
  /** Server-validated responsibility fact. Legacy requests omit these fields. */
  responsibilityType?: InspectionIssueResponsibilityType | null;
  responsibleDepartment?: null | string;
  responsibleDepartmentId?: null | string;
  selfCheckResult: InspectionRequestCheckResult;
  stationSelection?: InspectionStationSelection | null;
  status: InspectionRequestStatus;
  submittedAt: string;
  supplierId?: null | string;
  supplierName?: null | string;
  team?: null | string;
  teamId?: null | string;
  unqualifiedQuantity?: null | number;
  updatedAt: string;
  workOrderNumber: string;
  workOrderNumbers?: string[];
}

export interface CreateInspectionRequestParams {
  attachments: InspectionRequestAttachment[];
  category: 'INCOMING' | 'PROCESS';
  componentName?: string;
  mutualCheckResult?: InspectionRequestCheckResult;
  partId?: string;
  processId: string;
  quantity: number;
  reporter: string;
  requestedPartName?: string;
  requestInfo?: string;
  responsibilityType: InspectionIssueResponsibilityType;
  responsibleDepartmentId: string;
  selfCheckResult?: InspectionRequestCheckResult;
  stationSelection?: InspectionStationSelection;
  supplierId?: string;
  /** Optional PROCESS internal context. External responsibility is supplier-led. */
  team?: string;
  teamId?: string;
  workOrderNumber: string;
  workOrderNumbers?: string[];
}

export interface InspectionMaterialRequestListItem {
  id: string;
  inspectionRequestId: string;
  reporter: string;
  requestedName: string;
  requestNo: string;
  resolvedPartId: null | string;
  resolvedPartName?: null | string;
  reviewedAt: null | string;
  reviewRemark: null | string;
  status: InspectionMaterialApprovalStatus;
  submittedAt: string;
  supplierName: null | string;
  workOrderNumber: string;
}

export interface ApproveInspectionMaterialRequestParams {
  mode: InspectionMaterialResolutionMode;
  name?: string;
  partId?: string;
  remark?: string;
}

export interface RejectInspectionMaterialRequestParams {
  remark: string;
}

export interface DispatchInspectionRequestParams {
  dispatchRemark?: string;
  inspectorId: string;
  priority?: number;
}

export interface CloseInspectionRequestParams {
  attachments?: InspectionRequestAttachment[];
  closeRemark?: string;
  hasDocuments?: boolean;
  inspectionDate?: string;
  inspectionId?: string;
  inspectionItems?: Array<{
    acceptanceCriteria?: string;
    checkItem: string;
    measuredValue?: string;
    remarks?: string;
    result?: 'FAIL' | 'NA' | 'PASS';
    standardValue?: string;
    uom?: string;
  }>;
  inspector?: string;
  linkedIssue?: {
    claim?: string;
    defectCategoryId?: string;
    defectSubcategoryId?: string;
    defectSubtype?: string;
    defectType?: string;
    description?: string;
    division?: string;
    divisionId?: string;
    generateNcNumber: boolean;
    lossAmount?: number;
    partName?: string;
    photos?: string[];
    processName?: string;
    qualifiedQuantity?: number;
    quantity?: number;
    reportDate?: string;
    reportedBy?: string;
    responsibilityType: InspectionIssueResponsibilityType;
    responsibleDepartmentId: string;
    responsibleWelder?: string;
    rootCause?: string;
    severity?: string;
    solution?: string;
    status?: string;
    supplierId?: string;
    unqualifiedQuantity?: number;
  };
  qualifiedQuantity?: number;
  quantity?: number;
  result?: 'FAIL' | 'PASS';
  unqualifiedQuantity?: number;
}
