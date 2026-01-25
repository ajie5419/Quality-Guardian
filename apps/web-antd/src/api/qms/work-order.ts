import { requestClient } from '#/api/request';
import { QMS_API } from './constants';
import type { WorkOrderItem } from '@qgs/shared';

// Re-export shared types
export * from '@qgs/shared';

/**
 * Get Work Order list (Paginated with Summary)
 */
export async function getWorkOrderList(params?: {
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
export async function createWorkOrder(
  data: Partial<WorkOrderItem>,
) {
  return requestClient.post<WorkOrderItem>(
    QMS_API.WORK_ORDER,
    data,
  );
}

export async function updateWorkOrder(
  id: string,
  data: Partial<WorkOrderItem>,
) {
  return requestClient.put<WorkOrderItem>(
    `${QMS_API.WORK_ORDER}/${id}`,
    data,
  );
}

export async function deleteWorkOrder(id: string) {
  return requestClient.delete(`${QMS_API.WORK_ORDER}/${id}`);
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
