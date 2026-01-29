import type { InspectionIssue, InspectionRecord } from '@qgs/shared';

import { requestClient } from '#/api/request';

import { QMS_API } from './constants';

// Re-export types for backward compatibility (optional, can be removed if views are updated)
export * from '@qgs/shared';

/**
 * Get Inspection Issues
 */
export async function getInspectionIssues(params?: {
  supplierName?: string;
  year?: number;
}) {
  return requestClient.get<InspectionIssue[]>(QMS_API.INSPECTION_ISSUES, {
    params,
  });
}

/**
 * Create Inspection Issue
 */
export async function createInspectionIssue(data: Partial<InspectionIssue>) {
  return requestClient.post<InspectionIssue>(QMS_API.INSPECTION_ISSUES, data);
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

// --- Inspection Records APIs ---

export async function getInspectionRecords(params?: {
  type?: string;
  year?: number;
  keyword?: string;
  page?: number;
  pageSize?: number;
}) {
  return requestClient.get<{ items: InspectionRecord[]; total: number }>(
    QMS_API.INSPECTION_RECORDS,
    { params },
  );
}

export async function createInspectionRecord(data: Partial<InspectionRecord>) {
  return requestClient.post<InspectionRecord>(QMS_API.INSPECTION_RECORDS, data);
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

export async function batchDeleteInspectionRecords(ids: string[]) {
  return requestClient.post<{ successCount: number }>(
    QMS_API.INSPECTION_RECORDS_BATCH_DELETE,
    { ids },
  );
}

export namespace QmsInspectionApi {
  export type InspectionTaskResult = import('@qgs/shared').InspectionTaskResult;
  export type InspectionIssue = import('@qgs/shared').InspectionIssue;
  export type InspectionRecord = import('@qgs/shared').InspectionRecord;
  export type DetailedInspectionRecord = InspectionRecord & {
    items: InspectionTaskResult[];
  };
}
