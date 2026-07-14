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
  linkedIssueId?: null | string;
  linkedIssueNo?: null | string;
  linkedIssueStatus?: null | string;
  mutualCheckResult: InspectionRequestCheckResult;
  partName: string;
  priority: number;
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
  componentName?: string;
  mutualCheckResult?: InspectionRequestCheckResult;
  partName: string;
  processName: string;
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
    lossAmount?: number;
    ncNumber?: string;
    partName?: string;
    photos?: string[];
    processName?: string;
    qualifiedQuantity?: number;
    quantity?: number;
    reportDate?: string;
    reportedBy?: string;
    responsibleDepartment?: string;
    responsibleWelder?: string;
    rootCause?: string;
    severity?: string;
    solution?: string;
    status?: string;
    supplierName?: string;
    unqualifiedQuantity?: number;
  };
  qualifiedQuantity?: number;
  quantity?: number;
  result?: 'FAIL' | 'PASS';
  unqualifiedQuantity?: number;
}
