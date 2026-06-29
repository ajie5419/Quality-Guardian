import type {
  QualityLossCharts,
  QualityLossDashboardSummary,
  QualityLossItem,
  QualityLossPageResult,
  QualityLossParams,
} from '@qgs/shared';

import { requestClient } from '#/api/request';

// Re-export types

export type QualityLossQueryParams = QualityLossParams;

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
