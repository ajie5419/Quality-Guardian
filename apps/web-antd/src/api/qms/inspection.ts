import type {
  IdentityAggregateItem,
  IdentityResolutionStatus,
  InspectionIssue,
  InspectionRecord,
} from '@qgs/shared';

import type { QmsImportSummary } from '#/api/qms/types';

import { normalizeListResponse } from '#/api/qms/adapters';
import { requestClient } from '#/api/request';

import { QMS_API } from './constants';

// Inspection Issue Stats type
export interface InspectionIssueStats {
  closedCount: number;
  closedRate: number;
  openCount: number;
  pareto: Array<{
    cumulativePercent: number;
    id: null | string;
    label: string;
    percent: number;
    resolutionStatus: IdentityResolutionStatus;
    value: number;
  }>;
  pieData: IdentityAggregateItem[];
  totalCount: number;
  totalLoss: number;
  trendData: Array<{ period: string; value: number }>;
}

export type InspectionIssueChartDimension =
  | 'claim'
  | 'defectSubtype'
  | 'defectType'
  | 'division'
  | 'projectName'
  | 'reportMonth'
  | 'responsibleDepartment'
  | 'severity'
  | 'status'
  | 'supplierName';

export type InspectionIssueChartMetric = 'count' | 'lossAmount' | 'quantity';

export type InspectionIssueChartAggregateItem = IdentityAggregateItem;

// Re-export types for backward compatibility (optional, can be removed if views are updated)

export async function getInspectionIssues(params?: {
  dateMode?: 'month' | 'week' | 'year';
  dateValue?: string;
  defectCategoryId?: string | string[];
  endDate?: string;
  page?: number;
  pageSize?: number;
  processName?: string;
  projectName?: string;
  responsibleDepartment?: string | string[];
  responsibleWelder?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  startDate?: string;
  status?: string | string[];
  supplierName?: string;
  workOrderNumber?: string;
  year?: number;
}) {
  const raw = await requestClient.get<{
    items: InspectionIssue[];
    total: number;
  }>(QMS_API.INSPECTION_ISSUES, { params });
  return normalizeListResponse<InspectionIssue>(raw);
}

export async function getInspectionIssueStats(params?: {
  dateMode?: 'month' | 'week' | 'year';
  dateValue?: string;
  year?: number;
}) {
  return requestClient.get<InspectionIssueStats>(
    QMS_API.INSPECTION_ISSUES_STATS,
    { params },
  );
}

export async function getInspectionIssueChartAggregate(params: {
  dateMode?: 'month' | 'week' | 'year';
  dateValue?: string;
  dimension: InspectionIssueChartDimension;
  metric: InspectionIssueChartMetric;
  top?: number;
  year?: number;
}) {
  return requestClient.get<{ items: InspectionIssueChartAggregateItem[] }>(
    QMS_API.INSPECTION_ISSUES_CHART_AGGREGATE,
    { params },
  );
}

/**
 * Create Inspection Issue
 */
export async function createInspectionIssue(
  data: Partial<InspectionIssue> | Record<string, unknown>,
) {
  return requestClient.post<InspectionIssue>(QMS_API.INSPECTION_ISSUES, data);
}

export async function updateInspectionIssue(
  id: string,
  data: Partial<InspectionIssue> | Record<string, unknown>,
) {
  return requestClient.put<InspectionIssue>(
    `${QMS_API.INSPECTION_ISSUES}/${id}`,
    data,
  );
}

export async function deleteInspectionIssue(id: string) {
  return requestClient.delete(`${QMS_API.INSPECTION_ISSUES}/${id}`);
}

/**
 * Batch delete inspection issues
 */
export async function batchDeleteInspectionIssues(ids: string[]) {
  return requestClient.post<{ successCount: number }>(
    QMS_API.INSPECTION_ISSUES_BATCH_DELETE,
    { ids },
  );
}

export async function importInspectionIssues(
  items: Partial<InspectionIssue>[],
) {
  return requestClient.post<QmsImportSummary>(
    `${QMS_API.INSPECTION_ISSUES}/import`,
    { items },
  );
}

// --- Inspection Records APIs ---

export async function getInspectionRecords(params?: {
  componentName?: string;
  endDate?: string;
  hasDocuments?: boolean;
  inspector?: string;
  keyword?: string;
  level1Component?: string;
  materialName?: string;
  page?: number;
  pageSize?: number;
  processName?: string;
  projectName?: string;
  sourceInspectionId?: string;
  startDate?: string;
  supplierName?: string;
  team?: string;
  type?: string;
  workOrderNumber?: string;
  year?: number;
}) {
  const raw = await requestClient.get<{
    items: InspectionRecord[];
    total: number;
  }>(QMS_API.INSPECTION_RECORDS, { params });
  return normalizeListResponse<InspectionRecord>(raw);
}

export async function getInspectionRecordsExport(params?: {
  componentName?: string;
  endDate?: string;
  hasDocuments?: boolean;
  inspector?: string;
  keyword?: string;
  level1Component?: string;
  materialName?: string;
  processName?: string;
  projectName?: string;
  sourceInspectionId?: string;
  startDate?: string;
  supplierName?: string;
  team?: string;
  type?: string;
  workOrderNumber?: string;
  year?: number;
}) {
  const raw = await requestClient.get<{
    items: InspectionRecord[];
    total: number;
  }>(`${QMS_API.INSPECTION_RECORDS}/export`, { params });
  return normalizeListResponse<InspectionRecord>(raw);
}

export async function createInspectionRecord(data: Partial<InspectionRecord>) {
  return requestClient.post<InspectionRecord>(QMS_API.INSPECTION_RECORDS, data);
}

export async function updateInspectionRecord(
  id: string,
  data: Partial<InspectionRecord>,
) {
  return requestClient.put<InspectionRecord>(
    `${QMS_API.INSPECTION_RECORDS}/${id}`,
    data,
  );
}

export async function deleteInspectionRecord(id: string) {
  return requestClient.delete(`${QMS_API.INSPECTION_RECORDS}/${id}`);
}

export async function batchDeleteInspectionRecords(ids: string[]) {
  return requestClient.post<{ successCount: number }>(
    QMS_API.INSPECTION_RECORDS_BATCH_DELETE,
    { ids },
  );
}

export interface InspectionRecordPrintItem {
  acceptanceCriteria?: null | string;
  checkItem: string;
  id: string;
  measuredValue?: null | string;
  remarks?: null | string;
  result: 'FAIL' | 'NA' | 'PASS';
  standardValue?: null | string;
  uom?: null | string;
}

export interface InspectionRecordPrintDetail {
  category: string;
  drawingNo?: null | string;
  formNo?: null | string;
  id: string;
  incomingType?: null | string;
  inspectionDate: string;
  inspector: string;
  items: InspectionRecordPrintItem[];
  level1Component?: null | string;
  level2Component?: null | string;
  materialName?: null | string;
  processName?: null | string;
  projectName?: null | string;
  qualifiedQuantity?: null | number;
  quantity: number;
  remarks?: null | string;
  reportDate?: null | string;
  result: 'FAIL' | 'PASS';
  serialNumber?: null | string;
  supplierName?: null | string;
  templateId?: null | string;
  templateName?: null | string;
  unqualifiedQuantity?: null | number;
  workOrderNumber: string;
  printHeaders?: {
    checkItem?: string;
    measuredValue?: string;
    remarks?: string;
    result?: string;
    standard?: string;
  };
}

export async function getInspectionRecordDetail(id: string) {
  return requestClient.get<InspectionRecordPrintDetail>(
    `${QMS_API.INSPECTION_RECORDS}/${id}`,
  );
}

export async function importInspectionRecords(data: {
  category: string;
  items: Partial<InspectionRecord>[];
}) {
  return requestClient.post<QmsImportSummary>(
    `${QMS_API.INSPECTION_RECORDS}/import`,
    data,
  );
}

export async function updateInspectionArchiveTaskStatus(
  id: string,
  data: {
    status: 'ARCHIVED' | 'IN_PROGRESS' | 'PENDING' | 'REJECTED';
    workContent?: string;
  },
) {
  return requestClient.put(
    `${QMS_API.INSPECTION_ARCHIVE_TASKS}/${id}/status`,
    data,
  );
}

export namespace QmsInspectionApi {
  export type InspectionTaskResult = import('@qgs/shared').InspectionTaskResult;
  export type InspectionIssue = import('@qgs/shared').InspectionIssue;
  export type InspectionRecord = import('@qgs/shared').InspectionRecord;
  export type DetailedInspectionRecord = InspectionRecord & {
    items: InspectionTaskResult[];
    templateId?: string;
    templateName?: string;
  };
}
