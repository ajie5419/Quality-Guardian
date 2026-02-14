import type {
  VehicleCommissioningDailyReport,
  VehicleCommissioningDailyReportPayload,
  VehicleCommissioningIssue,
  VehicleCommissioningIssueParams,
} from '@qgs/shared';

import { requestClient } from '#/api/request';

import { QMS_API } from './constants';

export async function getVehicleCommissioningIssues(
  params?: VehicleCommissioningIssueParams,
) {
  return requestClient.get<{
    items: VehicleCommissioningIssue[];
    total: number;
  }>(QMS_API.VEHICLE_COMMISSIONING_ISSUES, { params });
}

export async function createVehicleCommissioningIssue(
  data: Partial<VehicleCommissioningIssue>,
) {
  return requestClient.post<VehicleCommissioningIssue>(
    QMS_API.VEHICLE_COMMISSIONING_ISSUES,
    data,
  );
}

export async function updateVehicleCommissioningIssue(
  id: string,
  data: Partial<VehicleCommissioningIssue>,
) {
  return requestClient.put<VehicleCommissioningIssue>(
    `${QMS_API.VEHICLE_COMMISSIONING_ISSUES}/${id}`,
    data,
  );
}

export async function getVehicleCommissioningIssueLogs(id: string) {
  return requestClient.get<
    Array<{
      action: string;
      createdAt: string;
      details: string;
      id: string;
      operator: string;
    }>
  >(`${QMS_API.VEHICLE_COMMISSIONING_ISSUES}/${id}/logs`);
}

export async function getVehicleCommissioningReports(params?: {
  page?: number;
  pageSize?: number;
  projectName?: string;
}) {
  return requestClient.get<{
    items: VehicleCommissioningDailyReport[];
    total: number;
  }>(QMS_API.VEHICLE_COMMISSIONING_REPORTS, { params });
}

export async function createVehicleCommissioningReport(
  data: VehicleCommissioningDailyReportPayload,
) {
  return requestClient.post<VehicleCommissioningDailyReport>(
    QMS_API.VEHICLE_COMMISSIONING_REPORTS,
    data,
  );
}

export async function getVehicleCommissioningReportPreview(id: string) {
  return requestClient.get<VehicleCommissioningDailyReport>(
    `${QMS_API.VEHICLE_COMMISSIONING_REPORTS}/${id}/preview`,
  );
}
