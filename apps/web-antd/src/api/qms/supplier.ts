import type { QmsSupplierApi } from '#/types/api/supplier';

import { requestClient } from '#/api/request';

import { QMS_API } from './constants';

export type { QmsSupplierApi };

/**
 * Get Supplier list
 */
export async function getSupplierList(
  params?: QmsSupplierApi.SupplierListParams,
) {
  const query = params
    ? `?${new URLSearchParams(params as any).toString()}`
    : '';
  return requestClient.get<QmsSupplierApi.SupplierListResponse>(
    `${QMS_API.SUPPLIER}${query}`,
  );
}

/**
 * Create Supplier
 */
export async function createSupplier(
  data: Partial<QmsSupplierApi.SupplierItem>,
) {
  return requestClient.post<QmsSupplierApi.SupplierItem>(
    QMS_API.SUPPLIER,
    data,
  );
}

export async function updateSupplier(
  id: string,
  data: Partial<QmsSupplierApi.SupplierItem>,
) {
  return requestClient.put<QmsSupplierApi.SupplierItem>(
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
  items: QmsSupplierApi.ImportSupplierItem[],
) {
  // 设置 2 分钟超时，防止大数据量导入中断
  return requestClient.post(
    QMS_API.SUPPLIER_BATCH,
    { items },
    { timeout: 120 * 1000 },
  );
}
