import type { QualityLossItem } from '@qgs/shared';

import { requestClient } from '#/api/request';

// Re-export types
export * from '@qgs/shared';

export interface QualityLossQueryParams {
  granularity?: 'month' | 'week' | 'year';
  lossSource?: string;
  page?: number;
  pageSize?: number;
  status?: string;
  workOrderNumber?: string;
  year?: number;
}

export interface QualityLossPageResult {
  items: QualityLossItem[];
  total: number;
}

export interface QualityLossDashboardSummary {
  kpi: {
    displayRate: string;
    pendingAmount: number;
    recoveryRate: number;
    totalAmount: number;
    totalClaim: number;
  };
  years: number[];
}

export interface QualityLossCharts {
  deptDistribution: Array<{ name: string; value: number }>;
  trend: Array<{
    claimAmount: number;
    period: number;
    periodLabel: string;
    totalAmount: number;
  }>;
}

/**
 * Get Quality Loss list (paginated)
 */
export async function getQualityLossList(params?: QualityLossQueryParams) {
  return requestClient.get<QualityLossPageResult>('/qms/quality-loss', {
    params,
  });
}

export async function getQualityLossDashboardSummary(
  params?: Omit<QualityLossQueryParams, 'page' | 'pageSize' | 'year'>,
) {
  return requestClient.get<QualityLossDashboardSummary>(
    '/qms/quality-loss/dashboard',
    { params },
  );
}

export async function getQualityLossCharts(
  params?: QualityLossQueryParams,
  signal?: AbortSignal,
) {
  return requestClient.get<QualityLossCharts>('/qms/quality-loss/charts', {
    params,
    signal,
  });
}

export async function getQualityLossExportList(
  params?: Omit<QualityLossQueryParams, 'page' | 'pageSize'>,
) {
  return requestClient.get<QualityLossPageResult>('/qms/quality-loss/export', {
    params,
  });
}

/**
 * Create Quality Loss record
 */
export async function createQualityLoss(data: Partial<QualityLossItem>) {
  return requestClient.post<QualityLossItem>('/qms/quality-loss', data);
}

export async function updateQualityLoss(
  id: string,
  data: Partial<QualityLossItem>,
) {
  return requestClient.put<QualityLossItem>(`/qms/quality-loss/${id}`, data);
}

export async function deleteQualityLoss(id: string) {
  return requestClient.delete(`/qms/quality-loss/${id}`);
}

export async function batchDeleteQualityLoss(ids: string[]) {
  return requestClient.post<{ successCount: number }>(
    '/qms/quality-loss/batch-delete',
    { ids },
  );
}

export namespace QmsQualityLossApi {
  export type QualityLossItem = import('@qgs/shared').QualityLossItem;
}
