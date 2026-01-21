import { requestClient } from '#/api/request';

import { QMS_API } from './constants';

export namespace QmsWorkOrderApi {
  export interface WorkOrderItem {
    id: string;
    workOrderNumber: string;
    division?: string;
    customerName: string;
    projectName?: string;
    quantity: number;
    deliveryDate: string;
    status: 'Closed' | 'Completed' | 'In Progress' | 'Pending';
    createTime: string;
    effectiveTime?: string;
  }
}

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
    items: QmsWorkOrderApi.WorkOrderItem[];
    summary: Array<{ division: string; quantity: number; status: string }>;
    total: number;
  }>(QMS_API.WORK_ORDER, { params });
}

/**
 * Create Work Order
 */
export async function createWorkOrder(
  data: Partial<QmsWorkOrderApi.WorkOrderItem>,
) {
  return requestClient.post<QmsWorkOrderApi.WorkOrderItem>(
    QMS_API.WORK_ORDER,
    data,
  );
}

export async function updateWorkOrder(
  id: string,
  data: Partial<QmsWorkOrderApi.WorkOrderItem>,
) {
  return requestClient.put<QmsWorkOrderApi.WorkOrderItem>(
    `${QMS_API.WORK_ORDER}/${id}`,
    data,
  );
}

export async function deleteWorkOrder(id: string) {
  return requestClient.delete(`${QMS_API.WORK_ORDER}/${id}`);
}
