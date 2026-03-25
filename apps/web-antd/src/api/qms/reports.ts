import type {
  QualityReportSummary,
  ReportItem,
  DailySummaryData as SharedDailySummaryData,
} from '@qgs/shared';

import {
  normalizeListResponse,
  normalizeMutationResponse,
} from '#/api/qms/adapters';
import { requestClient } from '#/api/request';

import { QMS_API } from './constants';

// Re-export shared types
export * from '@qgs/shared';

export type DailySummaryData = SharedDailySummaryData & {
  archiveStats?: {
    archivedCount: number;
    missingTemplateCount?: number;
    overdueCount: number;
    requiredCount: number;
    timelinessRate: number;
  };
  engineeringTodos?: Array<{
    processName: string;
    projectName: string;
    seq: number;
    status: string;
    workOrder: string;
  }>;
};

export function getSummaryReport(params: {
  date?: string;
  type: 'monthly' | 'weekly';
}) {
  return requestClient.get<QualityReportSummary>(QMS_API.REPORTS_SUMMARY, {
    params,
  });
}

export function getDailySummary(params: { date: string; user?: string }) {
  return requestClient.get<DailySummaryData>(QMS_API.REPORTS_DAILY, {
    params,
  });
}

export function saveDailySummary(data: {
  date: string;
  documentItems: DailySummaryData['documentItems'];
  summary: string;
  user?: string;
}) {
  return requestClient.put<{
    date: string;
    documentItems: DailySummaryData['documentItems'];
    reporter: string;
    summary: string;
  }>(QMS_API.REPORTS_DAILY, data);
}

/**
 * Get Reports list
 */
export async function getReportsList() {
  return requestClient.get<ReportItem[]>(QMS_API.REPORTS);
}

export async function getReportsListPage() {
  const raw = await getReportsList();
  return normalizeListResponse<ReportItem>(raw);
}

/**
 * Create Report
 */
export async function createReport(data: Partial<ReportItem>) {
  return requestClient.post<ReportItem>(QMS_API.REPORTS, data);
}

export async function updateReport(id: string, data: Partial<ReportItem>) {
  return requestClient.put<ReportItem>(`/qms/reports/${id}`, data);
}

export async function deleteReport(id: string) {
  return requestClient.delete(`/qms/reports/${id}`);
}

export async function createReportMutation(data: Partial<ReportItem>) {
  const raw = await createReport(data);
  return normalizeMutationResponse<ReportItem>(raw);
}

export async function updateReportMutation(
  id: string,
  data: Partial<ReportItem>,
) {
  const raw = await updateReport(id, data);
  return normalizeMutationResponse<ReportItem>(raw);
}
