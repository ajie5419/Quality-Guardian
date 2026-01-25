import { requestClient } from '#/api/request';
import { QMS_API } from './constants';
import type { 
  ReportItem, 
  DailySummaryData, 
  QualityReportSummary 
} from '@qgs/shared';

// Re-export shared types
export * from '@qgs/shared';

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
  return requestClient.get<ReportItem[]>(QMS_API.REPORTS);
}

/**
 * Create Report
 */
export async function createReport(data: Partial<ReportItem>) {
  return requestClient.post<ReportItem>(QMS_API.REPORTS, data);
}

export async function updateReport(
  id: string,
  data: Partial<ReportItem>,
) {
  return requestClient.put<ReportItem>(
    `/qms/reports/${id}`,
    data,
  );
}

export async function deleteReport(id: string) {
  return requestClient.delete(`/qms/reports/${id}`);
}
