import { requestClient } from '#/api/request';

import { QMS_API } from './constants';

export namespace QmsReportsApi {
  export interface ReportItem {
    id: string;
    date: string;
    totalInspections: number;
    passRate: number;
    majorDefects: number;
    minorDefects: number;
    status: 'Draft' | 'Published';
    author: string;
  }
}

export interface DailySummaryData {
  reporter: string;
  date: string;
  inspections: Array<{
    partName: string;
    process: string;
    projectName: string;
    quantity: number;
    result: string;
    seq: number;
    workOrder: string;
  }>;
  issues: Array<{
    dept: string;
    description: string;
    isToday: boolean;
    partName: string;
    seq: number;
    solution: string;
    status: string;
    workOrder: string;
  }>;
  summary: string;
}

export interface QualityReportSummary {
  defects: Array<{ name: string; value: number }>;
  majorEvents: Array<{
    date: string;
    desc: string;
    id: string;
    loss: number;
    project: string;
    status: string;
    title: string;
  }>;
  metrics: Array<{
    desc: string;
    history: number[];
    label: string;
    trend: number;
    unit: string;
    value: number;
  }>;
  period: string;
  suppliers: {
    best: Array<{ issues: number; name: string }>;
    worst: Array<{ issues: number; name: string }>;
  };
  title: string;
  topProjects: Array<{
    issues: number;
    loss: number;
    name: string;
  }>;
}

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

/**
 * Get Reports list
 */
export async function getReportsList() {
  return requestClient.get<QmsReportsApi.ReportItem[]>(QMS_API.REPORTS);
}

/**
 * Create Report
 */
export async function createReport(data: Partial<QmsReportsApi.ReportItem>) {
  return requestClient.post<QmsReportsApi.ReportItem>(QMS_API.REPORTS, data);
}

export async function updateReport(
  id: string,
  data: Partial<QmsReportsApi.ReportItem>,
) {
  return requestClient.put<QmsReportsApi.ReportItem>(
    `/qms/reports/${id}`,
    data,
  );
}

export async function deleteReport(id: string) {
  return requestClient.delete(`/qms/reports/${id}`);
}
