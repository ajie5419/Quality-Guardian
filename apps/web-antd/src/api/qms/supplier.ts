import type {
  ImportSupplierItem,
  SupplierItem,
  SupplierListParams,
  SupplierListResponse,
} from '@qgs/shared';

import type { QmsImportSummary } from '#/api/qms/types';

import { requestClient } from '#/api/request';

import { QMS_API, QMS_IMPORT_TIMEOUT } from './constants';

// Re-export shared types
export * from '@qgs/shared';

/**
 * Get Supplier list
 */
export async function getSupplierList(params?: SupplierListParams) {
  return requestClient.get<SupplierListResponse>(QMS_API.SUPPLIER, { params });
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

export async function deleteSupplier(id: string) {
  return requestClient.delete(`${QMS_API.SUPPLIER}/${id}`);
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
  export type SupplierStats = import('@qgs/shared').SupplierStats;
  export type SupplierListParams = import('@qgs/shared').SupplierListParams;
}
