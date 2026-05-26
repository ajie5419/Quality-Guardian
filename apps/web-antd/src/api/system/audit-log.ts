import type { AuditLog, AuditLogPageResult, AuditLogParams } from '@qgs/shared';

import { requestClient } from '#/api/request';

export type AuditLogItem = AuditLog;
export type AuditLogQueryParams = AuditLogParams;

/**
 * Get Audit Log list (paginated)
 */
export async function getAuditLogList(params?: AuditLogQueryParams) {
  return requestClient.get<AuditLogPageResult>('/system/audit-log', {
    params,
  });
}

/**
 * Delete an audit log entry
 */
export async function deleteAuditLog(id: string) {
  return requestClient.delete(`/system/audit-log/${id}`);
}

/**
 * Batch delete audit log entries
 */
export async function batchDeleteAuditLogs(ids: string[]) {
  return requestClient.post('/system/audit-log/batch-delete', { ids });
}
