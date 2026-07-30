import { normalizeListResponse } from '#/api/qms/adapters';
import { requestClient } from '#/api/request';

export interface PartMasterItem {
  id: string;
  name: string;
  sort: number;
  status: 0 | 1;
}

export interface PartMasterOption {
  id: string;
  name: string;
}

const PART_MASTER_PATH = '/system/parts';

export async function getPartMasterListApi(params?: {
  keyword?: string;
  page?: number;
  pageSize?: number;
  status?: 0 | 1;
}) {
  const result = await requestClient.get<{
    items: PartMasterItem[];
    page: number;
    pageSize: number;
    total: number;
  }>(PART_MASTER_PATH, { params });
  return normalizeListResponse<PartMasterItem>(result);
}

export function getPartMasterOptionsApi(params: {
  keyword: string;
  take?: number;
}) {
  return requestClient.get<PartMasterOption[]>('/qms/common/part-options', {
    params,
  });
}

export function createPartMasterApi(data: { name: string; sort?: number }) {
  return requestClient.post<PartMasterItem>(PART_MASTER_PATH, data);
}

export function updatePartMasterApi(
  id: string,
  data: { name?: string; sort?: number; status?: 0 | 1 },
) {
  return requestClient.put<PartMasterItem>(`${PART_MASTER_PATH}/${id}`, data);
}

export function deletePartMasterApi(id: string) {
  return requestClient.delete(`${PART_MASTER_PATH}/${id}`);
}
