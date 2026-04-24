export type MetrologyInspectionStatus =
  | 'DISABLED'
  | 'EXPIRED'
  | 'PENDING'
  | 'VALID';

export type MetrologyBorrowStatus = 'AVAILABLE' | 'BORROWED';

export interface MetrologyItem {
  borrowStatus: MetrologyBorrowStatus;
  borrowStatusLabel: string;
  createdAt?: null | string;
  id: string;
  inspectionStatus: MetrologyInspectionStatus;
  inspectionStatusLabel: string;
  instrumentCode: string;
  instrumentName: string;
  model?: null | string;
  orderNo?: null | number;
  remainingDays?: null | number;
  sourceFileName?: null | string;
  updatedAt?: null | string;
  usingUnit?: null | string;
  validUntil?: null | string;
}

export interface MetrologyListParams {
  inspectionStatus?: MetrologyInspectionStatus;
  instrumentCode?: string;
  instrumentName?: string;
  keyword?: string;
  model?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  usingUnit?: string;
  validFrom?: string;
  validTo?: string;
}

export interface MetrologyListResponse {
  items: MetrologyItem[];
  total: number;
}

export interface MetrologyMutationPayload {
  inspectionStatus: MetrologyInspectionStatus;
  instrumentCode: string;
  instrumentName: string;
  model?: null | string;
  orderNo?: null | number;
  usingUnit?: null | string;
  validUntil?: null | string;
}

export interface MetrologyOverview {
  disabledCount: number;
  expiredCount: number;
  expiringSoonCount: number;
  totalCount: number;
  validCount: number;
}

export type MetrologyBorrowRecordStatus = 'BORROWED' | 'OVERDUE' | 'RETURNED';

export interface MetrologyBorrowInstrumentMatchItem {
  borrowStatus: MetrologyBorrowStatus;
  borrowStatusLabel: string;
  currentBorrowedAt?: null | string;
  currentBorrowerDepartment?: null | string;
  currentBorrowerName?: null | string;
  currentBorrowRecordId?: null | string;
  id: string;
  inspectionStatus: MetrologyInspectionStatus;
  inspectionStatusLabel: string;
  instrumentCode: string;
  instrumentName: string;
  model?: null | string;
  orderNo?: null | number;
  usingUnit?: null | string;
  validUntil?: null | string;
}

export interface MetrologyBorrowRecordItem {
  borrowedAt: string;
  borrowerDepartment: string;
  borrowerName: string;
  borrowStatus: MetrologyBorrowStatus;
  borrowStatusLabel: string;
  createdAt?: null | string;
  expectedReturnAt?: null | string;
  id: string;
  inspectionStatus: MetrologyInspectionStatus;
  inspectionStatusLabel: string;
  instrumentCode: string;
  instrumentId: string;
  instrumentName: string;
  model?: null | string;
  orderNo?: null | number;
  remark?: null | string;
  returnedAt?: null | string;
  status: MetrologyBorrowRecordStatus;
  statusLabel: string;
  updatedAt?: null | string;
  usingUnit?: null | string;
  validUntil?: null | string;
}

export interface MetrologyBorrowListParams {
  borrowerDepartment?: string;
  borrowerName?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  status?: MetrologyBorrowRecordStatus;
}

export interface MetrologyBorrowListResponse {
  items: MetrologyBorrowRecordItem[];
  total: number;
}

export interface MetrologyBorrowOverview {
  monthlyDistribution: Array<{
    borrowedCount: number;
    month: number;
    returnedCount: number;
  }>;
  summary: {
    borrowedCount: number;
    overdueCount: number;
    todayBorrowedCount: number;
    todayReturnedCount: number;
    totalCount: number;
    upcomingReturnCount: number;
  };
  upcomingItems: MetrologyBorrowRecordItem[];
}

export interface MetrologyBorrowMutationPayload {
  borrowedAt: string;
  borrowerDepartment: string;
  borrowerName: string;
  expectedReturnAt?: null | string;
  instrumentId: string;
  remark?: null | string;
}

export interface MetrologyBorrowReturnPayload {
  remark?: null | string;
  returnedAt: string;
}

export type MetrologyCalibrationPlanStatus =
  | 'COMPLETED'
  | 'OVERDUE'
  | 'PLANNED';

export interface MetrologyCalibrationPlanItem {
  actualDate?: null | string;
  createdAt?: null | string;
  id: string;
  instrumentCode: string;
  instrumentId: string;
  instrumentName: string;
  model?: null | string;
  orderNo?: null | number;
  planDay: number;
  planMonth: number;
  plannedDate: string;
  planYear: number;
  remark?: null | string;
  sourceFileName?: null | string;
  status: MetrologyCalibrationPlanStatus;
  statusLabel: string;
  updatedAt?: null | string;
  usingUnit?: null | string;
}

export interface MetrologyCalibrationPlanListParams {
  keyword?: string;
  month?: number;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  status?: MetrologyCalibrationPlanStatus;
  usingUnit?: string;
  year?: number;
}

export interface MetrologyCalibrationPlanListResponse {
  items: MetrologyCalibrationPlanItem[];
  total: number;
}

export interface MetrologyCalibrationPlanMutationPayload {
  actualDate?: null | string;
  instrumentId: string;
  planDay: number;
  planMonth: number;
  planYear: number;
  remark?: null | string;
}

export interface MetrologyCalibrationAnnualCell {
  actualDate?: null | string;
  id: null | string;
  planDay: null | number;
  plannedDate?: null | string;
  status?: MetrologyCalibrationPlanStatus;
  statusLabel?: null | string;
}

export interface MetrologyCalibrationAnnualRow {
  instrumentCode: string;
  instrumentId: string;
  instrumentName: string;
  model?: null | string;
  months: Record<string, MetrologyCalibrationAnnualCell>;
  orderNo?: null | number;
  usingUnit?: null | string;
}

export interface MetrologyCalibrationAnnualGridParams {
  keyword?: string;
  usingUnit?: string;
  year?: number;
}

export interface MetrologyCalibrationPlanSummary {
  completedCount: number;
  currentMonthCount: number;
  overdueCount: number;
  totalCount: number;
  upcomingCount: number;
}

export interface MetrologyCalibrationPlanMonthlyDistributionItem {
  completed: number;
  month: number;
  overdue: number;
  planned: number;
  total: number;
}

export interface MetrologyCalibrationPlanOverview {
  monthlyDistribution: MetrologyCalibrationPlanMonthlyDistributionItem[];
  summary: MetrologyCalibrationPlanSummary;
  upcomingItems: MetrologyCalibrationPlanItem[];
}
