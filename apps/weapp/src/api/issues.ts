import type { InspectionIssue } from '@qgs/shared';

import { request } from './request';

export interface InspectionIssueRecord extends InspectionIssue {
  division?: string;
  processName?: string;
  responsibleDepartments?: string[];
  supplierName?: string;
}

export interface InspectionIssueListParams {
  dateMode?: 'month' | 'week' | 'year';
  dateValue?: string;
  defectType?: string | string[];
  page?: number;
  pageSize?: number;
  processName?: string;
  projectName?: string;
  responsibleDepartment?: string | string[];
  severity?: string | string[];
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  status?: string | string[];
  supplierName?: string;
  workOrderNumber?: string;
  year?: number;
}

export interface IssueOption {
  label: string;
  value: string;
}

export type InspectionIssuePayload = Partial<InspectionIssueRecord> & {
  photos: string[];
  responsibleDepartment: string;
  responsibleDepartments: string[];
};

export function getInspectionIssues(params: InspectionIssueListParams) {
  return request<{ items: InspectionIssueRecord[]; total: number }>({
    url: '/api/qms/inspection/issues',
    method: 'GET',
    data: params as Record<string, unknown>,
  });
}

export function getInspectionIssue(id: string) {
  return request<InspectionIssueRecord>({
    url: `/api/qms/inspection/issues/${id}`,
    method: 'GET',
  });
}

export function createInspectionIssue(data: InspectionIssuePayload) {
  return request<InspectionIssueRecord>({
    url: '/api/qms/inspection/issues',
    method: 'POST',
    data: data as Record<string, unknown>,
  });
}

export function updateInspectionIssue(
  id: string,
  data: InspectionIssuePayload,
) {
  return request<null>({
    url: `/api/qms/inspection/issues/${id}`,
    method: 'PUT',
    data: data as Record<string, unknown>,
  });
}

export function getIssueWelders() {
  return request<{
    items: Array<{ name: string; welderCode?: null | string }>;
    total: number;
  }>({
    url: '/api/qms/welder',
    method: 'GET',
    data: { employmentStatus: 'ON_DUTY', page: 1, pageSize: 200 },
  });
}

export function getIssueSuppliers(category: 'Outsourcing' | 'Supplier') {
  return request<{
    items: Array<{ name: string }>;
    total: number;
  }>({
    url: '/api/qms/supplier',
    method: 'GET',
    data: { category, page: 1, pageSize: 200 },
  });
}
