import type {
  CloseInspectionRequestParams,
  CreateInspectionRequestParams,
  DispatchInspectionRequestParams,
  InspectionRequest,
  WorkOrderItem,
} from '@qgs/shared';

import { normalizeListResponse } from '#/api/qms/adapters';
import { requestClient } from '#/api/request';

import { QMS_API } from './constants';

export * from '@qgs/shared';

export interface InspectionRequestStats {
  byInspector: Array<{ count: number; inspector: string }>;
  byTeam: Array<{ count: number; team: string }>;
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
  reinspectionRateByTeam: Array<{
    inspectedCount: number;
    reinspectionCount: number;
    reinspectionRate: number;
    submittedCount: number;
    team: string;
  }>;
  todayClosedCount: number;
  todaySubmittedCount: number;
}

export async function getInspectionRequests(params?: {
  current?: boolean;
  includeClosed?: boolean;
  keyword?: string;
  mine?: boolean;
  page?: number;
  pageSize?: number;
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
  return requestClient.post<InspectionRequest>(
    QMS_API.PUBLIC_INSPECTION_REQUESTS,
    data,
  );
}

export async function getPublicInspectionRequestProcesses(params: {
  workOrderNumber: string;
}) {
  return requestClient.get<Array<{ processName: string }>>(
    QMS_API.PUBLIC_INSPECTION_REQUEST_PROCESSES,
    { params },
  );
}

export async function getPublicInspectionRequestTeams(params?: {
  keyword?: string;
}) {
  return requestClient.get<
    Array<{
      group: 'external' | 'internal';
      label: string;
      value: string;
    }>
  >(QMS_API.PUBLIC_INSPECTION_REQUEST_TEAMS, { params });
}

export async function getPublicInspectionRequestWorkOrders(params?: {
  keyword?: string;
  page?: number;
  pageSize?: number;
  workOrderNumber?: string;
}) {
  const raw = await requestClient.get<{
    items: WorkOrderItem[];
    total: number;
  }>(QMS_API.PUBLIC_INSPECTION_REQUEST_WORK_ORDERS, { params });
  return normalizeListResponse<WorkOrderItem>(raw);
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
