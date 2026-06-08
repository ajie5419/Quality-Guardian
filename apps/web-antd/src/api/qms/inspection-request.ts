import type {
  CloseInspectionRequestParams,
  CreateInspectionRequestParams,
  DispatchInspectionRequestParams,
  InspectionRequest,
  WorkOrderItem,
} from '@qgs/shared';

import type { DictionaryOptionItem } from '#/api/system/dictionary';

import { normalizeListResponse } from '#/api/qms/adapters';
import { publicRequestClient, requestClient } from '#/api/request';

import { QMS_API } from './constants';

export * from '@qgs/shared';

export interface InspectionRequestStats {
  byInspector: Array<{ count: number; inspector: string }>;
  bySupplier: Array<{ count: number; team: string }>;
  byTeam: Array<{ count: number; team: string }>;
  dailyTrend: Array<{
    closedCount: number;
    date: string;
    submittedCount: number;
  }>;
  historyByInspector: Array<{
    averageTaskMinutes: number;
    completedTaskCount: number;
    inspector: string;
  }>;
  historyByTeam: Array<{ count: number; team: string }>;
  inspectorStatus: Array<{
    activeTaskCount: number;
    averageTaskMinutes: number;
    completedTaskCount: number;
    currentTaskMinutes: number;
    inspector: string;
    status: 'BUSY' | 'IDLE';
  }>;
  pendingDispatchCount: number;
  pendingInspectionCount: number;
  reinspectionRateBySupplier: Array<{
    inspectedCount: number;
    reinspectionCount: number;
    reinspectionRate: number;
    submittedCount: number;
    team: string;
  }>;
  reinspectionRateByTeam: Array<{
    inspectedCount: number;
    reinspectionCount: number;
    reinspectionRate: number;
    submittedCount: number;
    team: string;
  }>;
  todayClosedCount: number;
  todayClosedIncomingCount: number;
  todayClosedProcessCount: number;
  todaySubmittedCount: number;
  todaySubmittedIncomingCount: number;
  todaySubmittedProcessCount: number;
}

export async function getInspectionRequests(params?: {
  current?: boolean;
  includeClosed?: boolean;
  keyword?: string;
  mine?: boolean;
  page?: number;
  pageSize?: number;
  processName?: string;
  status?: string;
  workOrderNumber?: string;
}) {
  const raw = await requestClient.get<{
    items: InspectionRequest[];
    total: number;
  }>(QMS_API.INSPECTION_REQUESTS, { params });
  return normalizeListResponse<InspectionRequest>(raw);
}

export async function getInspectionRequestStats() {
  return requestClient.get<InspectionRequestStats>(
    QMS_API.INSPECTION_REQUESTS_STATS,
  );
}

export async function getInspectionRequestStatsWithParams(params?: {
  endDate?: string;
  period?: 'halfYear' | 'month' | 'quarter' | 'year';
  startDate?: string;
}) {
  return requestClient.get<InspectionRequestStats>(
    QMS_API.INSPECTION_REQUESTS_STATS,
    { params },
  );
}

export async function getInspectionRequest(id: string) {
  return requestClient.get<InspectionRequest>(
    `${QMS_API.INSPECTION_REQUESTS}/${id}`,
  );
}

export async function createInspectionRequest(
  data: CreateInspectionRequestParams,
) {
  return requestClient.post<InspectionRequest>(
    QMS_API.INSPECTION_REQUESTS,
    data,
  );
}

export async function createPublicInspectionRequest(
  data: CreateInspectionRequestParams,
) {
  return publicRequestClient.post<InspectionRequest>(
    QMS_API.PUBLIC_INSPECTION_REQUESTS,
    data,
  );
}

export async function getPublicInspectionRequestProcesses(params: {
  workOrderNumber: string;
}) {
  return publicRequestClient.get<Array<{ processName: string }>>(
    QMS_API.PUBLIC_INSPECTION_REQUEST_PROCESSES,
    { params },
  );
}

export async function getPublicInspectionRequestProcessDictionaryOptions() {
  return publicRequestClient.get<DictionaryOptionItem[]>(
    QMS_API.PUBLIC_INSPECTION_REQUEST_PROCESS_DICTIONARY_OPTIONS,
  );
}

export interface PublicInspectionRequestBomPart {
  id: string;
  partName: string;
  partNumber?: null | string;
  workOrderNumber: string;
}

export async function getPublicInspectionRequestBomParts(params: {
  workOrderNumber: string;
}) {
  return publicRequestClient.get<PublicInspectionRequestBomPart[]>(
    QMS_API.PUBLIC_INSPECTION_REQUEST_BOM_PARTS,
    { params },
  );
}

export async function getPublicInspectionRequestTeams(params?: {
  keyword?: string;
}) {
  return publicRequestClient.get<
    Array<{
      group: 'external' | 'internal';
      label: string;
      value: string;
    }>
  >(QMS_API.PUBLIC_INSPECTION_REQUEST_TEAMS, { params });
}

export async function getPublicInspectionRequestSuppliers(params?: {
  category?: string;
  keyword?: string;
}) {
  return publicRequestClient.get<Array<{ label: string; value: string }>>(
    QMS_API.PUBLIC_INSPECTION_REQUEST_SUPPLIERS,
    { params },
  );
}

export async function getPublicInspectionRequestWorkOrders(params?: {
  keyword?: string;
  page?: number;
  pageSize?: number;
  workOrderNumber?: string;
}) {
  const raw = await publicRequestClient.get<{
    items: WorkOrderItem[];
    total: number;
  }>(QMS_API.PUBLIC_INSPECTION_REQUEST_WORK_ORDERS, { params });
  return normalizeListResponse<WorkOrderItem>(raw);
}

export interface PublicTodayIncomingInspectionItem {
  requestNo: string;
  partName: string;
  supplierName: string;
  workOrderNumber: string;
  quantity: number;
  qualifiedQuantity: null | number;
  unqualifiedQuantity: null | number;
  reporter: string;
  status: string;
  inspectionResult: string;
  incomingType: string;
  notes: string;
  submittedAt: string;
  closedAt: null | string;
}

export interface PublicTodayIncomingInspectionResponse {
  summary: {
    conditional: number;
    fail: number;
    pass: number;
    pending: number;
    total: number;
  };
  pendingItems: PublicTodayIncomingInspectionItem[];
  passItems: PublicTodayIncomingInspectionItem[];
  failItems: PublicTodayIncomingInspectionItem[];
  conditionalItems: PublicTodayIncomingInspectionItem[];
  generatedAt: string;
  dateLabel: string;
  truncated: boolean;
}

export async function getPublicTodayIncomingInspections() {
  return publicRequestClient.get<PublicTodayIncomingInspectionResponse>(
    QMS_API.PUBLIC_TODAY_INCOMING_INSPECTION,
  );
}

export async function dispatchInspectionRequest(
  id: string,
  data: DispatchInspectionRequestParams,
) {
  return requestClient.post<InspectionRequest>(
    `${QMS_API.INSPECTION_REQUESTS}/${id}/dispatch`,
    data,
  );
}

export async function closeInspectionRequest(
  id: string,
  data: CloseInspectionRequestParams,
) {
  return requestClient.post<InspectionRequest>(
    `${QMS_API.INSPECTION_REQUESTS}/${id}/close`,
    data,
  );
}

export async function deleteInspectionRequest(id: string) {
  return requestClient.delete(`${QMS_API.INSPECTION_REQUESTS}/${id}`);
}
