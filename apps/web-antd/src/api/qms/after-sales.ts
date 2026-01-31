import type {
  AfterSalesItem,
  AfterSalesParams,
  AfterSalesStats,
} from '@qgs/shared';

import { requestClient } from '#/api/request';

// Re-export types
export * from '@qgs/shared';

/**
 * Get After-sales list
 */
export async function getAfterSalesList(params?: AfterSalesParams) {
  return requestClient.get<AfterSalesItem[]>('/qms/after-sales', { params });
}

/**
 * Get After-sales statistics
 */
export async function getAfterSalesStats(params?: { year?: number }) {
  return requestClient.get<AfterSalesStats>('/qms/after-sales/stats', {
    params,
  });
}

/**
 * Create After-sales record
 */
export async function createAfterSales(data: Partial<AfterSalesItem>) {
  return requestClient.post<AfterSalesItem>('/qms/after-sales', data);
}

export async function updateAfterSales(
  id: string,
  data: Partial<AfterSalesItem>,
) {
  return requestClient.put<AfterSalesItem>(`/qms/after-sales/${id}`, data);
}

export async function deleteAfterSales(id: string) {
  return requestClient.delete(`/qms/after-sales/${id}`);
}

/**
 * Batch delete after-sales records
 */
export async function batchDeleteAfterSales(ids: string[]) {
  return requestClient.post<{ successCount: number }>(
    '/qms/after-sales/batch-delete',
    { ids },
  );
}

/**
 * Import After-sales excel
 */
export async function importAfterSalesExcel(
  items: Array<Record<string, unknown>>,
  signal?: AbortSignal,
) {
  return requestClient.post<{ successCount: number }>(
    '/qms/after-sales/import',
    { items },
    {
      timeout: 120_000,
      signal,
    },
  );
}

export namespace QmsAfterSalesApi {
  export type AfterSalesItem = import('@qgs/shared').AfterSalesItem;
  export type AfterSalesStats = import('@qgs/shared').AfterSalesStats;
  export type AfterSalesParams = import('@qgs/shared').AfterSalesParams;
}
