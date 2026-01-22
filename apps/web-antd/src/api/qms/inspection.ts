import type { InspectionIssueStatusEnum } from './enums';

import { requestClient } from '#/api/request';

import { QMS_API } from './constants';

export namespace QmsInspectionApi {
  export interface InspectionIssue {
    id: string;
    workOrderNumber: string; // 工单号
    projectName: string; // 项目名称
    partName: string; // 部件名称
    ncNumber: string; // 不合格编号
    title: string;
    severity: 'Critical' | 'Major' | 'Minor';
    status: 'Closed' | 'Open' | 'Resolved' | InspectionIssueStatusEnum;
    quantity: number; // 数量
    reportedBy: string; // 检验员
    responsibleDepartment: string; // 责任部门
    reportDate: string;
    updatedAt: string; // 最后编辑时间
    division?: string;
    defectType?: string;
    defectSubtype?: string;
    description: string;
    rootCause: string; // 原因分析
    solution: string; // 解决方案
    lossAmount: number; // 损失金额
    claim: string; // 索赔
    photos: string[]; // 问题照片
    supplierName?: string; // 供应商名称
  }

  export interface IncomingInspection {
    id: string;
    supplierName: string;
    materialName: string;
    quantity: number;
    inspector: string;
    reporter: string;
    reportDate: string;
    hasDocuments: string;
  }

  export interface ProcessInspection {
    id: string;
    workOrderNumber: string;
    process: string;
    level1Component: string;
    componentName: string;
    quantity: number;
    inspector: string;
    reporter: string;
    team: string;
    archived: string;
  }

  export interface ShipmentInspection {
    id: string;
    workOrderNumber: string;
    projectName: string;
    quantity: number;
    reporter: string;
    inspector: string;
    reportDate: string;
    documents: string;
    packingListArchived: string;
  }

  export interface InspectionTaskResult {
    itpItemId: string;
    activity: string;
    controlPoint: string;
    isQuantitative: boolean;
    standardValue?: number;
    upperTolerance?: number;
    lowerTolerance?: number;
    unit?: string;
    measuredValue?: number;
    result: 'FAIL' | 'NA' | 'PASS';
    remarks?: string;
    photoUrl?: string;
  }

  export interface DetailedInspectionRecord {
    id: string;
    type: 'FINAL' | 'INCOMING' | 'OUTGOING' | 'PROCESS';
    workOrderNumber: string;
    projectName?: string;
    itpProjectId?: string;
    inspector: string;
    reportDate: string;
    status: 'COMPLETED' | 'DRAFT';
    results: InspectionTaskResult[];
    overallResult: 'FAIL' | 'PASS';
    createdAt: string;
    updatedAt: string;
  }

  export type InspectionRecord =
    | DetailedInspectionRecord
    | IncomingInspection
    | ProcessInspection
    | ShipmentInspection;
}

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
  return requestClient.get<QmsInspectionApi.InspectionIssue[]>(
    `${QMS_API.INSPECTION_ISSUES}${query}`,
  );
}

/**
 * Create Inspection Issue
 */
export async function createInspectionIssue(
  data: Partial<QmsInspectionApi.InspectionIssue>,
) {
  return requestClient.post<QmsInspectionApi.InspectionIssue>(
    QMS_API.INSPECTION_ISSUES,
    data,
  );
}

export async function updateInspectionIssue(
  id: string,
  data: Partial<QmsInspectionApi.InspectionIssue>,
) {
  return requestClient.put<QmsInspectionApi.InspectionIssue>(
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
  return requestClient.get<QmsInspectionApi.InspectionRecord[]>(
    `${QMS_API.INSPECTION_RECORDS}${query}`,
  );
}

/**
 * Create Inspection Record
 */
export async function createInspectionRecord(
  data: Partial<QmsInspectionApi.InspectionRecord>,
) {
  return requestClient.post<QmsInspectionApi.InspectionRecord>(
    QMS_API.INSPECTION_RECORDS,
    data,
  );
}

export async function updateInspectionRecord(
  id: string,
  data: Partial<QmsInspectionApi.InspectionRecord>,
) {
  return requestClient.put<QmsInspectionApi.InspectionRecord>(
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
