import type {
  ImportSupplierItem,
  InspectionRecord,
  SupplierItem,
  SupplierListParams,
  SupplierListResponse,
} from '@qgs/shared';

import type { QmsImportSummary } from '#/api/qms/types';

import {
  normalizeListResponse,
  normalizeMutationResponse,
} from '#/api/qms/adapters';
import { requestClient } from '#/api/request';

import { QMS_API, QMS_IMPORT_TIMEOUT } from './constants';

// Re-export shared types

/**
 * Get Supplier list
 */
export async function getSupplierList(params?: SupplierListParams) {
  return requestClient.get<SupplierListResponse>(QMS_API.SUPPLIER, { params });
}

export async function getSupplierListPage(params?: SupplierListParams) {
  const raw = await getSupplierList(params);
  const normalized = normalizeListResponse<SupplierItem>(raw);
  return {
    ...normalized,
    stats: raw.stats,
  };
}

export async function getSupplierExportList(params?: SupplierListParams) {
  const raw = await requestClient.get<SupplierListResponse>(
    '/qms/supplier/export',
    {
      params,
    },
  );
  return normalizeListResponse<SupplierItem>(raw);
}

/**
 * Create Supplier
 */
export async function createSupplier(data: Partial<SupplierItem>) {
  return requestClient.post<SupplierItem>(QMS_API.SUPPLIER, data);
}

export async function updateSupplier(id: string, data: Partial<SupplierItem>) {
  return requestClient.put<SupplierItem>(`${QMS_API.SUPPLIER}/${id}`, data);
}

export interface SupplierHistoryProjectItem {
  lastSubmittedAt?: null | string;
  projectName?: null | string;
  workOrderNumber: string;
}

export async function getSupplierHistoryProjects(id: string) {
  return requestClient.get<{ items: SupplierHistoryProjectItem[] }>(
    `${QMS_API.SUPPLIER}/${id}/history-projects`,
  );
}

export type SupplierInspectionHistorySource = 'INCOMING' | 'PROCESS';

export type SupplierInspectionHistoryItem = InspectionRecord & {
  inspectionDate?: null | string;
  partName: null | string;
  result?: null | string;
  workOrderNumber: string;
};

export interface SupplierInspectionHistoryResponse {
  items: SupplierInspectionHistoryItem[];
  source: SupplierInspectionHistorySource;
  total: number;
}

export async function getSupplierInspectionHistory(
  id: string,
  params: { page: number; pageSize: number },
) {
  return requestClient.get<SupplierInspectionHistoryResponse>(
    `${QMS_API.SUPPLIER}/${id}/inspection-history`,
    { params },
  );
}

export async function deleteSupplier(id: string) {
  return requestClient.delete(`${QMS_API.SUPPLIER}/${id}`);
}

export async function createSupplierMutation(data: Partial<SupplierItem>) {
  const raw = await createSupplier(data);
  return normalizeMutationResponse<SupplierItem>(raw);
}

export async function updateSupplierMutation(
  id: string,
  data: Partial<SupplierItem>,
) {
  const raw = await updateSupplier(id, data);
  return normalizeMutationResponse<SupplierItem>(raw);
}

/**
 * Batch delete suppliers
 */
export async function batchDeleteSuppliers(ids: string[]) {
  return requestClient.post(QMS_API.SUPPLIER_BATCH_DELETE, { ids });
}

/**
 * Batch import suppliers
 */
export async function batchImportSuppliers(items: ImportSupplierItem[]) {
  // Set timeout to prevent interruption during large data imports
  return requestClient.post(
    QMS_API.SUPPLIER_BATCH,
    { items },
    { timeout: QMS_IMPORT_TIMEOUT },
  );
}

export async function importSuppliers(data: {
  category: string;
  items: Array<Record<string, unknown>>;
}) {
  return requestClient.post<QmsImportSummary>('/qms/supplier/import', data, {
    timeout: QMS_IMPORT_TIMEOUT,
  });
}

export namespace QmsSupplierApi {
  export type SupplierItem = import('@qgs/shared').SupplierItem & {
    afterSalesScore?: number;
    engineeringScore?: number;
    incomingScore?: number;
    stabilityScore?: number;
  };
  export type SupplierHistoryProject = SupplierHistoryProjectItem;
  export type SupplierInspectionHistory = SupplierInspectionHistoryItem;
  export type SupplierInspectionHistorySource =
    import('#/api/qms/supplier').SupplierInspectionHistorySource;
  export type SupplierStats = import('@qgs/shared').SupplierStats;
  export type SupplierListParams = import('@qgs/shared').SupplierListParams;
}
