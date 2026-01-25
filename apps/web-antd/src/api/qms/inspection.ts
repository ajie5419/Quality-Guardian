import { requestClient } from '#/api/request';
import { QMS_API } from './constants';
import type { 
  InspectionIssue, 
  InspectionRecord 
} from '@qgs/shared';

// Re-export types for backward compatibility (optional, can be removed if views are updated)
export * from '@qgs/shared';

/**
 * Get Inspection Issues
 */
export async function getInspectionIssues(params?: {
  supplierName?: string;
  year?: number;
}) {
  const query = params
    ? `?${new URLSearchParams(params as any).toString()}`
    : '';
  return requestClient.get<InspectionIssue[]>(
    `${QMS_API.INSPECTION_ISSUES}${query}`,
  );
}

/**
 * Create Inspection Issue
 */
export async function createInspectionIssue(
  data: Partial<InspectionIssue>,
) {
  return requestClient.post<InspectionIssue>(
    QMS_API.INSPECTION_ISSUES,
    data,
  );
}

export async function updateInspectionIssue(
  id: string,
  data: Partial<InspectionIssue>,
) {
  return requestClient.put<InspectionIssue>(
    `${QMS_API.INSPECTION_ISSUES}/${id}`,
    data,
  );
}

export async function deleteInspectionIssue(id: string) {
  return requestClient.delete(`${QMS_API.INSPECTION_ISSUES}/${id}`);
}

/**
 * Batch delete inspection issues
 */
export async function batchDeleteInspectionIssues(ids: string[]) {
  return requestClient.post<{ successCount: number }>(
    QMS_API.INSPECTION_ISSUES_BATCH_DELETE,
    { ids },
  );
}

/**
 * Get Inspection Records
 */
export async function getInspectionRecords(params?: {
  brand?: string;
  supplierName?: string;
  type?: string;
  year?: number;
}) {
  const query = params
    ? `?${new URLSearchParams(params as any).toString()}`
    : '';
  return requestClient.get<InspectionRecord[]>(
    `${QMS_API.INSPECTION_RECORDS}${query}`,
  );
}

/**
 * Create Inspection Record
 */
export async function createInspectionRecord(
  data: Partial<InspectionRecord>,
) {
  return requestClient.post<InspectionRecord>(
    QMS_API.INSPECTION_RECORDS,
    data,
  );
}

export async function updateInspectionRecord(
  id: string,
  data: Partial<InspectionRecord>,
) {
  return requestClient.put<InspectionRecord>(
    `${QMS_API.INSPECTION_RECORDS}/${id}`,
    data,
  );
}

export async function deleteInspectionRecord(id: string) {
  return requestClient.delete(`${QMS_API.INSPECTION_RECORDS}/${id}`);
}

/**
 * Batch delete inspection records
 */
export async function batchDeleteInspectionRecords(ids: string[]) {
  return requestClient.post<{ successCount: number }>(
    QMS_API.INSPECTION_RECORDS_BATCH_DELETE,
    { ids },
  );
}
