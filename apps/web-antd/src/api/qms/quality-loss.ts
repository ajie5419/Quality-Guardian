import type { QualityLossItem } from '@qgs/shared';

import { requestClient } from '#/api/request';

// Re-export types
export * from '@qgs/shared';

export interface QualityLossQueryParams {
  lossSource?: string;
  page?: number;
  pageSize?: number;
  status?: string;
  workOrderNumber?: string;
}

export interface QualityLossPageResult {
  items: QualityLossItem[];
  total: number;
}

/**
 * Get Quality Loss list (paginated)
 */
export async function getQualityLossList(params?: QualityLossQueryParams) {
  return requestClient.get<QualityLossPageResult>('/qms/quality-loss', {
    params,
  });
}

/**
 * Get Quality Loss summary (all records for KPIs and charts)
 */
export async function getQualityLossSummary(params?: QualityLossQueryParams) {
  return requestClient.get<QualityLossItem[]>('/qms/quality-loss/summary', {
    params,
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
