import type { WeeklyReportData } from '@qgs/shared';

import { requestClient } from '#/api/request';

export * from '@qgs/shared';

/**
 * Get Weekly Report Data
 */
export function getWeeklyReport(params: {
  endDate: string;
  startDate: string;
}) {
  return requestClient.get<WeeklyReportData>('/qms/reports/weekly', {
    params,
  });
}
