import type {
  AfterSalesItem,
  AfterSalesParams,
  AfterSalesStats,
} from '@qgs/shared';

import type { QmsImportSummary, QmsListResponse } from '#/api/qms/types';

import { QMS_IMPORT_TIMEOUT } from '#/api/qms/constants';
import { requestClient } from '#/api/request';

// Re-export types

/**
 * Get After-sales list items for legacy array consumers.
 */
export async function getAfterSalesList(params?: AfterSalesParams) {
  const page = await getAfterSalesListPage(params);
  return page.items;
}

/**
 * Get After-sales list (standard pagination shape for page layer)
 */
export async function getAfterSalesListPage(
  params?: AfterSalesParams,
): Promise<QmsListResponse<AfterSalesItem>> {
  return requestClient.get<QmsListResponse<AfterSalesItem>>(
    '/qms/after-sales',
    { params },
  );
}

/**
 * Get After-sales statistics
 */
export async function getAfterSalesStats(params?: {
  dateMode?: 'month' | 'week' | 'year';
  dateValue?: string;
  year?: number;
}) {
  return requestClient.get<AfterSalesStats>('/qms/after-sales/stats', {
    params,
  });
}

export type AfterSalesChartDimension =
  | 'defectSubtype'
  | 'defectType'
  | 'productSubtype'
  | 'productType'
  | 'reportMonth'
  | 'responsibleDept'
  | 'severity'
  | 'status'
  | 'supplierBrand';

export type AfterSalesChartMetric =
  | 'count'
  | 'laborTravelCost'
  | 'materialCost'
  | 'quantity'
  | 'runningHours'
  | 'totalLoss';

export type AfterSalesChartAggregateItem = {
  name: string;
  value: number;
};

export async function getAfterSalesChartAggregate(params: {
  dateMode?: 'month' | 'week' | 'year';
  dateValue?: string;
  dimension: AfterSalesChartDimension;
  metric: AfterSalesChartMetric;
  top?: number;
  year?: number;
}) {
  return requestClient.get<{ items: AfterSalesChartAggregateItem[] }>(
    '/qms/after-sales/chart-aggregate',
    { params },
  );
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
  return requestClient.post<QmsImportSummary>(
    '/qms/after-sales/import',
    { items },
    {
      timeout: QMS_IMPORT_TIMEOUT,
      signal,
    },
  );
}

export namespace QmsAfterSalesApi {
  export type AfterSalesItem = import('@qgs/shared').AfterSalesItem;
  export type AfterSalesStats = import('@qgs/shared').AfterSalesStats;
  export type AfterSalesParams = import('@qgs/shared').AfterSalesParams;
}
