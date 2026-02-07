import { requestClient } from '#/api/request';

export interface AuditLogItem {
  id: string;
  userId: string;
  username: string;
  action: string;
  targetType: string;
  targetId: string;
  details: string;
  ipAddress: string;
  userAgent: string;
  createdAt: string;
}

export interface AuditLogQueryParams {
  page?: number;
  pageSize?: number;
  userId?: string;
  action?: string;
  targetType?: string;
  startDate?: string;
  endDate?: string;
}

export interface AuditLogPageResult {
  items: AuditLogItem[];
  total: number;
}

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
