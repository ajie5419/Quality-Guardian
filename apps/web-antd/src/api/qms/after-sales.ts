import { requestClient } from '#/api/request';
import type { 
  AfterSalesItem, 
  AfterSalesParams, 
  AfterSalesStats 
} from '@qgs/shared';

// Re-export types
export * from '@qgs/shared';

/**
 * Get After-sales list
 */
export async function getAfterSalesList(
  params?: AfterSalesParams,
) {
  return requestClient.get<AfterSalesItem[]>(
    '/qms/after-sales',
    { params },
  );
}

/**
 * Get After-sales statistics
 */
export async function getAfterSalesStats(params?: { year?: number }) {
  return requestClient.get<AfterSalesStats>(
    '/qms/after-sales/stats',
    { params },
  );
}

/**
 * Create After-sales record
 */
export async function createAfterSales(
  data: Partial<AfterSalesItem>,
) {
  return requestClient.post<AfterSalesItem>(
    '/qms/after-sales',
    data,
  );
}

export async function updateAfterSales(
  id: string,
  data: Partial<AfterSalesItem>,
) {
  return requestClient.put<AfterSalesItem>(
    `/qms/after-sales/${id}`,
    data,
  );
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
