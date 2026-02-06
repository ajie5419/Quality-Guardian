import { requestClient } from '#/api/request';

export interface LoginLogItem {
  id: string;
  username: string;
  ip: string;
  browser: string;
  os: string;
  device: string;
  method: string;
  status: string;
  message: string;
  createdAt: string;
}

export interface LoginLogQueryParams {
  page?: number;
  pageSize?: number;
  username?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
}

export interface LoginLogPageResult {
  items: LoginLogItem[];
  total: number;
}

/**
 * Get Login Log list (paginated)
 */
export async function getLoginLogList(params?: LoginLogQueryParams) {
  return requestClient.get<LoginLogPageResult>('/system/login-log', {
    params,
  });
}

/**
 * Delete a login log entry
 */
export async function deleteLoginLog(id: string) {
  return requestClient.delete(`/system/login-log/${id}`);
}

/**
 * Batch delete login log entries
 */
export async function batchDeleteLoginLogs(ids: string[]) {
  return requestClient.post('/system/login-log/batch-delete', { ids });
}
