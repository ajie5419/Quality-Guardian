export type InspectionRequestStatus =
  | 'CANCELLED'
  | 'CLOSED'
  | 'DISPATCHED'
  | 'INSPECTING'
  | 'SUBMITTED';

export type InspectionRequestCheckResult = 'FAIL' | 'NA' | 'PASS';

export interface InspectionRequestAttachment {
  name: string;
  size?: number;
  type?: string;
  url: string;
}

export interface InspectionRequest {
  attachments?: InspectionRequestAttachment[];
  closeAttachments?: InspectionRequestAttachment[];
  closedAt?: null | string;
  closeRemark?: null | string;
  createdAt: string;
  dispatchedAt?: null | string;
  dispatcherId?: null | string;
  dispatcherName?: null | string;
  dispatchRemark?: null | string;
  dispatchTaskId?: null | string;
  id: string;
  inspectionId?: null | string;
  inspectorId?: null | string;
  inspectorName?: null | string;
  mutualCheckResult: InspectionRequestCheckResult;
  partName: string;
  priority: number;
  processName: string;
  quantity: number;
  reporter: string;
  requestInfo?: null | string;
  requestNo: string;
  selfCheckResult: InspectionRequestCheckResult;
  status: InspectionRequestStatus;
  submittedAt: string;
  team?: null | string;
  updatedAt: string;
  workOrderNumber: string;
}

export interface CreateInspectionRequestParams {
  attachments: InspectionRequestAttachment[];
  mutualCheckResult?: InspectionRequestCheckResult;
  partName: string;
  processName: string;
  quantity: number;
  reporter: string;
  requestInfo?: string;
  selfCheckResult?: InspectionRequestCheckResult;
  team: string;
  workOrderNumber: string;
}

export interface DispatchInspectionRequestParams {
  dispatchRemark?: string;
  inspectorId: string;
  priority?: number;
}

export interface CloseInspectionRequestParams {
  attachments?: InspectionRequestAttachment[];
  closeRemark?: string;
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
