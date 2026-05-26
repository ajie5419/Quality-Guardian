import type { LoginLog, LoginLogPageResult, LoginLogParams } from '@qgs/shared';

import { requestClient } from '#/api/request';

export type LoginLogItem = LoginLog;
export type LoginLogQueryParams = LoginLogParams;

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
