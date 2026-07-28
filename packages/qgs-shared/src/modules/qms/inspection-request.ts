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
  supplierId: null | string;
  supplierName: string;
}

export interface InspectionRequest {
  attachments?: InspectionRequestAttachment[];
  closeAttachments?: InspectionRequestAttachment[];
  closedAt?: null | string;
  closeRemark?: null | string;
  componentName?: null | string;
  createdAt: string;
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
  mutualCheckResult: InspectionRequestCheckResult;
  partId?: null | string;
  partName: string;
  priority: number;
  processId?: null | string;
  processName: string;
  qualifiedQuantity?: null | number;
  quantity: number;
  reporter: string;
  requestInfo?: null | string;
  requestNo: string;
  selfCheckResult: InspectionRequestCheckResult;
  stationSelection?: InspectionStationSelection | null;
  status: InspectionRequestStatus;
  submittedAt: string;
  supplierId?: null | string;
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
  partId: string;
  processId: string;
  quantity: number;
  reporter: string;
  requestInfo?: string;
  selfCheckResult?: InspectionRequestCheckResult;
  stationSelection?: InspectionStationSelection;
  supplierId?: string;
  team: string;
  teamId?: string;
  workOrderNumber: string;
  workOrderNumbers?: string[];
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
    defectSubtype?: string;
    defectType?: string;
    description?: string;
    division?: string;
    divisionId?: string;
    lossAmount?: number;
    ncNumber?: string;
    partName?: string;
    photos?: string[];
    processName?: string;
    qualifiedQuantity?: number;
    quantity?: number;
    reportDate?: string;
    reportedBy?: string;
    responsibilityType?: InspectionIssueResponsibilityType;
    responsibleDepartment?: string;
    responsibleDepartmentId?: string;
    responsibleWelder?: string;
    rootCause?: string;
    severity?: string;
    solution?: string;
    status?: string;
    supplierId?: string;
    supplierName?: string;
    unqualifiedQuantity?: number;
  };
  qualifiedQuantity?: number;
  quantity?: number;
  result?: 'FAIL' | 'PASS';
  unqualifiedQuantity?: number;
}
