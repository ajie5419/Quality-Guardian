import type { QualityLossItem } from '@qgs/shared';

import { requestClient } from '#/api/request';

// Re-export types
export * from '@qgs/shared';

/**
 * Get Quality Loss list
 */
export async function getQualityLossList() {
  return requestClient.get<QualityLossItem[]>('/qms/quality-loss');
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
