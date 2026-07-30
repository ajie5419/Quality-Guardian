import type { CloseInspectionRequestParams } from '@qgs/shared';

import { request } from './request';

export interface DepartmentNode {
  children?: DepartmentNode[];
  id: string;
  name: string;
}

export interface DictionaryOptionItem {
  dictKey: string;
  dictValue: string;
  id: string;
  sort: number;
}

// Get inspection stats for home page
export function getInspectionStats() {
  return request<{
    pendingDispatchCount: number;
    pendingInspectionCount: number;
    todayClosedCount: number;
  }>({ url: '/api/qms/inspection/requests/stats' });
}

// Get task list (inspection requests)
export function getInspectionRequests(params: {
  mine?: boolean;
  page?: number;
  pageSize?: number;
  status?: string;
}) {
  return request<{ items: unknown[]; total: number }>({
    url: '/api/qms/inspection/requests',
    method: 'GET',
    data: params as Record<string, unknown>,
  });
}

// Get single inspection request detail
export function getInspectionRequest(id: string) {
  return request<Record<string, unknown>>({
    url: `/api/qms/inspection/requests/${id}`,
    method: 'GET',
  });
}

// Get user list (for inspector picker in dispatch)
export function getUserList(params?: { page?: number; pageSize?: number }) {
  return request<{
    items: Array<{ id: string; realName: string; username: string }>;
    total: number;
  }>({
    url: '/api/system/user/list',
    method: 'GET',
    data: { page: 1, pageSize: 100, ...params } as Record<string, unknown>,
  });
}

// Dispatch an inspection request
export function dispatchInspectionRequest(
  id: string,
  data: {
    dispatchRemark?: string;
    inspectorId: string;
    priority?: number;
  },
) {
  return request<unknown>({
    url: `/api/qms/inspection/requests/${id}/dispatch`,
    method: 'POST',
    data: data as Record<string, unknown>,
  });
}

// Close/complete an inspection request
export function closeInspectionRequest(
  id: string,
  data: CloseInspectionRequestParams,
) {
  return request<unknown>({
    url: `/api/qms/inspection/requests/${id}/close`,
    method: 'POST',
    data: data as Record<string, unknown>,
  });
}

// Submit a new inspection request
export function submitInspectionRequest(data: Record<string, unknown>) {
  return request<unknown>({
    url: '/api/qms/inspection/requests/v2',
    method: 'POST',
    data,
  });
}

// Search work orders by keyword
export function searchWorkOrders(keyword: string) {
  return request<{
    items: Array<{
      division?: string;
      projectName: string;
      quantity: number;
      workOrderNumber: string;
    }>;
    total: number;
  }>({
    url: '/api/qms/inspection/requests/work-orders',
    method: 'GET',
    data: { keyword, page: 1, pageSize: 20 },
  });
}

// Get processes for a given work order
export function getProcesses(workOrderNumber: string) {
  return request<
    Array<{
      category: 'INCOMING' | 'PROCESS';
      processId: string;
      processName: string;
    }>
  >({
    url: '/api/qms/inspection/requests/processes',
    method: 'GET',
    data: { workOrderNumber },
  });
}

export function getSuppliers(keyword?: string) {
  return request<Array<{ label: string; value: string }>>({
    url: '/api/qms/public/inspection/requests/suppliers',
    method: 'GET',
    data: keyword ? { keyword } : {},
  });
}

export function getProcessDictionaryOptions() {
  return request<DictionaryOptionItem[]>({
    url: '/api/qms/public/inspection/requests/process-dictionary-options',
    method: 'GET',
  });
}

// Get BOM parts for a given work order
export function getBomParts(workOrderNumber: string) {
  return request<
    Array<{
      id: string;
      partId?: null | string;
      partName: string;
      partNumber: string;
    }>
  >({
    url: '/api/qms/inspection/requests/bom-parts',
    method: 'GET',
    data: { workOrderNumber },
  });
}

export function getPartOptions(keyword: string) {
  return request<Array<{ id: string; name: string }>>({
    url: '/api/qms/public/inspection/requests/part-options',
    method: 'GET',
    data: { keyword },
  });
}

// Get team list
export function getTeams(keyword?: string) {
  return request<Array<{ group: string; label: string; value: string }>>({
    url: '/api/qms/inspection/requests/teams',
    method: 'GET',
    data: keyword ? { keyword } : {},
  });
}

// Get department list (for responsible-department picker)
export function getDepartments() {
  return request<DepartmentNode[]>({
    url: '/api/auth/departments',
    method: 'GET',
  });
}

// Get my inspection records (completed + inspecting for re-inspection)
export function getMyRecords(params?: { page?: number; pageSize?: number }) {
  return request<{ items: unknown[]; total: number }>({
    url: '/api/qms/inspection/requests',
    method: 'GET',
    data: { status: 'CLOSED,INSPECTING', mine: true, ...params } as Record<
      string,
      unknown
    >,
  });
}
