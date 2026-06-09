import { request } from './request';

// Get inspection stats for home page
export function getInspectionStats() {
  return request<{
    stats: {
      openIssuesCount: number;
      todayInspections: number;
      todayWorkOrders: number;
    };
  }>({ url: '/api/qms/workspace' });
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
    url: '/api/system/users',
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
  data: {
    attachments?: Array<{ name: string; url: string }>;
    closeRemark?: string;
    hasDocuments: boolean;
    qualifiedQuantity: number;
    quantity: number;
    result: 'FAIL' | 'PASS';
    unqualifiedQuantity: number;
  },
) {
  return request<unknown>({
    url: `/api/qms/inspection/requests/${id}/close`,
    method: 'POST',
    data: data as Record<string, unknown>,
  });
}

// Submit a new inspection request (public, no auth needed for basic submission)
export function submitInspectionRequest(data: Record<string, unknown>) {
  return request<unknown>({
    url: '/api/qms/public/inspection/requests',
    method: 'POST',
    data,
  });
}

// Get my inspection records (completed)
export function getMyRecords(params?: { page?: number; pageSize?: number }) {
  return request<{ items: unknown[]; total: number }>({
    url: '/api/qms/inspection/requests',
    method: 'GET',
    data: { status: 'CLOSED', mine: true, ...params } as Record<
      string,
      unknown
    >,
  });
}
