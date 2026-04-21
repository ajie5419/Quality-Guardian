import { normalizeListResponse } from '#/api/qms/adapters';
import { requestClient } from '#/api/request';

import { QMS_API } from './constants';

export interface WelderItem {
  certificationNo?: null | string;
  createdAt?: string;
  employmentStatus?: 'ON_DUTY' | 'RESIGNED';
  examDate?: null | string;
  examPassed: boolean;
  id: string;
  name: string;
  score: number;
  team: string;
  updatedAt?: string;
  welderCode?: null | string;
  welding_method?: null | string;
}

export interface WelderStats {
  averageScore: number | string;
  certifiedCount: number;
  examPassedCount: number;
  total: number;
  warningCount: number;
}

export interface WelderListParams {
  employmentStatus?: 'ON_DUTY' | 'RESIGNED';
  keyword?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  team?: string;
  welderCode?: string;
}

export interface WelderListResponse {
  items: WelderItem[];
  stats?: WelderStats;
  total: number;
}

export interface ImportWelderPayload {
  items: Array<Record<string, unknown>>;
}

export async function getWelderList(params?: WelderListParams) {
  return requestClient.get<WelderListResponse>(QMS_API.WELDER, { params });
}

export async function getWelderListPage(params?: WelderListParams) {
  const raw = await getWelderList(params);
  const normalized = normalizeListResponse<WelderItem>(raw);
  return {
    ...normalized,
    stats: raw.stats,
  };
}

export async function createWelder(data: Partial<WelderItem>) {
  return requestClient.post<WelderItem>(QMS_API.WELDER, data);
}

export async function updateWelder(id: string, data: Partial<WelderItem>) {
  return requestClient.put<WelderItem>(`${QMS_API.WELDER}/${id}`, data);
}

export async function deleteWelder(id: string) {
  return requestClient.delete(`${QMS_API.WELDER}/${id}`);
}

export async function importWelders(payload: ImportWelderPayload) {
  return requestClient.post<{
    errorCount: number;
    errors?: Array<Record<string, unknown>>;
    successCount: number;
    totalCount: number;
  }>(`${QMS_API.WELDER}/import`, payload, {
    timeout: 120_000,
  });
}

export namespace QmsWelderApi {
  export type WelderItem = import('./welder').WelderItem;
  export type WelderListParams = import('./welder').WelderListParams;
  export type WelderStats = import('./welder').WelderStats;
}
