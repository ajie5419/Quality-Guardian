import { requestClient } from '#/api/request';
import { QMS_API } from './constants';
import type { 
  SupplierItem, 
  SupplierListParams, 
  SupplierListResponse,
  ImportSupplierItem
} from '@qgs/shared';

// Re-export shared types
export * from '@qgs/shared';

/**
 * Get Supplier list
 */
export async function getSupplierList(
  params?: SupplierListParams,
) {
  const query = params
    ? `?${new URLSearchParams(params as any).toString()}`
    : '';
  return requestClient.get<SupplierListResponse>(
    `${QMS_API.SUPPLIER}${query}`,
  );
}

/**
 * Create Supplier
 */
export async function createSupplier(
  data: Partial<SupplierItem>,
) {
  return requestClient.post<SupplierItem>(
    QMS_API.SUPPLIER,
    data,
  );
}

export async function updateSupplier(
  id: string,
  data: Partial<SupplierItem>,
) {
  return requestClient.put<SupplierItem>(
    `${QMS_API.SUPPLIER}/${id}`,
    data,
  );
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
export async function batchImportSuppliers(
  items: ImportSupplierItem[],
) {
  // Set 2 minute timeout to prevent interruption during large data imports
  return requestClient.post(
    QMS_API.SUPPLIER_BATCH,
    { items },
    { timeout: 120 * 1000 },
  );
}
