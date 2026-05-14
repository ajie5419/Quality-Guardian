export type VehicleCommissioningIssueStatus =
  | 'CLOSED'
  | 'IN_PROGRESS'
  | 'OPEN'
  | 'RESOLVED';

export interface VehicleCommissioningIssue {
  assignee?: string;
  claimNotes?: string;
  claimStatus?: string;
  closedAt?: string;
  createdAt?: string;
  date: string;
  description: string;
  id: string;
  isClaim?: boolean;
  lossAmount?: number;
  partName: string;
  photos?: string[];
  projectName: string;
  recoveredAmount?: number;
  responsibleDepartment: string;
  severity?: string;
  solution?: string;
  status: VehicleCommissioningIssueStatus;
  title: string;
  updatedAt?: string;
  workOrderNumber?: string;
}

export interface VehicleCommissioningIssueParams {
  date?: string;
  page?: number;
  pageSize?: number;
  projectName?: string;
  status?: VehicleCommissioningIssueStatus;
  workOrderNumber?: string;
}

export interface VehicleCommissioningDailyReportPayload {
  date: string;
  issueIds?: string[];
  mainWorks: string[];
  notes?: string;
  projectName: string;
  reporters: string[];
  workOrderNumber?: string;
}

export interface VehicleCommissioningDailyReport {
  createdAt?: string;
  date: string;
  id: string;
  issueIds?: string[];
  mainWorks: string[];
  notes?: string;
  projectName: string;
  reporters: string[];
  reportText: string;
  updatedAt?: string;
  workOrderNumber?: string;
}
