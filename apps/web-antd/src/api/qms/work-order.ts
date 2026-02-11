import type { WorkOrderItem } from '@qgs/shared';

import { requestClient } from '#/api/request';

import { QMS_API } from './constants';

// Re-export shared types
export * from '@qgs/shared';

/**
 * 导入响应类型
 */
export interface ImportResponse {
  successCount: number;
  failedCount: number;
  errors: Array<{ message: string; row: number }>;
}

/**
 * Get Work Order list (Paginated with Summary)
 */
export async function getWorkOrderList(params?: {
  ids?: string; // Comma separated IDs
  ignoreYearFilter?: boolean;
  keyword?: string;
  page?: number;
  pageSize?: number;
  projectName?: string;
  status?: string;
  workOrderNumber?: string;
  year?: number;
}) {
  return requestClient.get<{
    items: WorkOrderItem[];
    summary: Array<{ division: string; quantity: number; status: string }>;
    total: number;
  }>(QMS_API.WORK_ORDER, { params });
}

/**
 * Create Work Order
 */
export async function createWorkOrder(data: Partial<WorkOrderItem>) {
  return requestClient.post<WorkOrderItem>(QMS_API.WORK_ORDER, data);
}

export async function updateWorkOrder(
  id: string,
  data: Partial<WorkOrderItem>,
) {
  // Use query param 'id' to handle special characters like '/'
  return requestClient.put<WorkOrderItem>(QMS_API.WORK_ORDER, data, {
    params: { id },
  });
}

export async function deleteWorkOrder(id: string) {
  // Use query param 'id' to handle special characters like '/'
  return requestClient.delete(QMS_API.WORK_ORDER, { params: { id } });
}

/**
 * Batch delete work orders
 */
export async function batchDeleteWorkOrders(ids: string[]) {
  return requestClient.post<{ successCount: number }>(
    QMS_API.WORK_ORDER_BATCH_DELETE,
    { ids },
  );
}

/**
 * Import work orders from Excel
 */
export async function importWorkOrders(items: Array<Record<string, unknown>>) {
  return requestClient.post<ImportResponse>(QMS_API.WORK_ORDER_IMPORT, {
    items,
  });
}

export namespace QmsWorkOrderApi {
  export type WorkOrderItem = import('@qgs/shared').WorkOrderItem;
}
