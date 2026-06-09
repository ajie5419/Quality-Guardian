import { request } from './request';

export function getInspectionStats() {
  return request<{
    stats: {
      openIssuesCount: number;
      todayInspections: number;
      todayWorkOrders: number;
    };
  }>({ url: '/api/qms/workspace' });
}

export function getMyTasks(params?: {
  page?: number;
  pageSize?: number;
  status?: string;
}) {
  return request<{ items: unknown[]; total: number }>({
    url: '/api/qms/inspection/requests',
    method: 'GET',
    data: { mine: true, ...params },
  });
}

export function getTaskDetail(id: string) {
  return request<unknown>({
    url: `/api/qms/inspection/requests/${id}`,
    method: 'GET',
  });
}

export function submitInspectionRequest(data: Record<string, unknown>) {
  return request<unknown>({
    url: '/api/qms/public/inspection/requests',
    method: 'POST',
    data,
  });
}

export function dispatchTask(id: string, data: { inspectorId: string }) {
  return request<unknown>({
    url: `/api/qms/inspection/requests/${id}/dispatch`,
    method: 'POST',
    data,
  });
}

export function closeInspection(id: string, data: Record<string, unknown>) {
  return request<unknown>({
    url: `/api/qms/inspection/requests/${id}/close`,
    method: 'POST',
    data,
  });
}

export function getMyRecords(params?: { page?: number; pageSize?: number }) {
  return request<{ items: unknown[]; total: number }>({
    url: '/api/qms/inspection/records',
    method: 'GET',
    data: { mine: true, ...params },
  });
}
