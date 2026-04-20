import type { WorkOrderItem } from '@qgs/shared';

import type { QmsImportSummary } from '#/api/qms/types';

import {
  normalizeListResponse,
  normalizeMutationResponse,
} from '#/api/qms/adapters';
import { requestClient } from '#/api/request';

import { QMS_API } from './constants';

// Re-export shared types
export * from '@qgs/shared';

/**
 * Get Work Order list (Paginated with Summary)
 */
export async function getWorkOrderList(params?: {
  endDate?: string;
  granularity?: 'month' | 'week' | 'year';
  ids?: string; // Comma separated IDs
  ignoreYearFilter?: boolean;
  keyword?: string;
  page?: number;
  pageSize?: number;
  productName?: string;
  projectName?: string;
  startDate?: string;
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

export async function getWorkOrderListPage(params?: {
  endDate?: string;
  granularity?: 'month' | 'week' | 'year';
  ids?: string;
  ignoreYearFilter?: boolean;
  keyword?: string;
  page?: number;
  pageSize?: number;
  productName?: string;
  projectName?: string;
  startDate?: string;
  status?: string;
  workOrderNumber?: string;
  year?: number;
}) {
  const raw = await getWorkOrderList(params);
  const normalized = normalizeListResponse<WorkOrderItem>(raw);
  return {
    ...normalized,
    summary: Array.isArray(raw.summary) ? raw.summary : [],
  };
}

export type WorkOrderDashboardStats = {
  completed: number;
  inProgress: number;
  pieData: Array<{ name: string; value: number }>;
  progressPercent: number;
  rankings: Array<{
    division: string;
    productName: string;
    warrantyCount: number;
  }>;
  total: number;
};

export async function getWorkOrderDashboardStats(params?: {
  endDate?: string;
  granularity?: 'month' | 'week' | 'year';
  ids?: string;
  ignoreYearFilter?: boolean;
  keyword?: string;
  productName?: string;
  projectName?: string;
  startDate?: string;
  status?: string;
  workOrderNumber?: string;
  year?: number;
}) {
  return requestClient.get<WorkOrderDashboardStats>(QMS_API.WORK_ORDER_STATS, {
    params,
  });
}

export async function getWorkOrderExportList(params?: {
  endDate?: string;
  granularity?: 'month' | 'week' | 'year';
  ids?: string;
  ignoreYearFilter?: boolean;
  keyword?: string;
  productName?: string;
  projectName?: string;
  startDate?: string;
  status?: string;
  workOrderNumber?: string;
  year?: number;
}) {
  const raw = await requestClient.get<{
    items: WorkOrderItem[];
    summary?: Array<{ division: string; quantity: number; status: string }>;
    total: number;
  }>(`${QMS_API.WORK_ORDER}/export`, { params });
  return normalizeListResponse<WorkOrderItem>(raw);
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

export async function createWorkOrderMutation(data: Partial<WorkOrderItem>) {
  const raw = await createWorkOrder(data);
  return normalizeMutationResponse<WorkOrderItem>(raw);
}

export async function updateWorkOrderMutation(
  id: string,
  data: Partial<WorkOrderItem>,
) {
  const raw = await updateWorkOrder(id, data);
  return normalizeMutationResponse<WorkOrderItem>(raw);
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
  return requestClient.post<QmsImportSummary>(QMS_API.WORK_ORDER_IMPORT, {
    items,
  });
}

export async function getWorkOrderRequirements(params: {
  workOrderNumber: string;
}) {
  return requestClient.get<
    Array<{
      attachment: string;
      confirmedAt?: null | string;
      confirmer: string;
      confirmStatus: 'CONFIRMED' | 'PENDING';
      createdAt: string;
      id: string;
      items: unknown[];
      partName: string;
      processName: string;
      requirementName: string;
      responsiblePerson: string;
      responsibleTeam: string;
      workOrderNumber: string;
    }>
  >(QMS_API.WORK_ORDER_REQUIREMENTS, { params });
}

export async function uploadWorkOrderRequirements(data: {
  requirements: Array<{
    attachment?: string;
    items?: unknown[];
    partName?: string;
    processName?: string;
    requirementName: string;
    responsiblePerson?: string;
    responsibleTeam?: string;
    workOrderNumber: string;
  }>;
}) {
  return requestClient.post<{
    items: Array<{
      id: string;
      requirementName: string;
      workOrderNumber: string;
    }>;
    success: boolean;
  }>(QMS_API.WORK_ORDER_REQUIREMENTS, data);
}

export async function confirmWorkOrderRequirement(id: string, confirm = true) {
  return requestClient.put<{
    confirmedAt?: null | string;
    confirmer?: null | string;
    confirmStatus: 'CONFIRMED' | 'PENDING';
    id: string;
  }>(`${QMS_API.WORK_ORDER_REQUIREMENTS}/${id}`, { confirm });
}

export namespace QmsWorkOrderApi {
  export type WorkOrderItem = import('@qgs/shared').WorkOrderItem;
}
