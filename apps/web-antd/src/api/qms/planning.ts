import type {
  BomItem,
  BomProject,
  BomTreeNode,
  DfmeaItem,
  DfmeaProject,
  DfmeaProjectStats,
  DfmeaTreeNode,
  ItpItem,
  ItpProject,
  ItpTreeNode,
} from '@qgs/shared';

import type { QmsImportSummary, QmsListResponse } from '#/api/qms/types';

import { requestClient } from '#/api/request';

export interface ProjectDocumentLedgerItem {
  createdAt: string;
  id: string;
  projectName: string;
  sourceInspectionId?: string;
  sourceIssueId?: string;
  sourceIssueNumber?: string;
  sourceLabel?: string;
  sourceType: 'INSPECTION' | 'ISSUE' | 'MANUAL';
  status: string;
  updatedAt: string;
  workContent: string;
  workOrderNumber: string;
}

export interface InspectionFormTemplateItem {
  attachments?: string;
  createdAt: string;
  createdBy?: string;
  customerName?: string;
  drawingNo?: string;
  formFields?:
    | Array<{
        acceptanceCriteria?: string;
        checkItem?: string;
        lowerTolerance?: number;
        standardValue?: number;
        unit?: string;
        upperTolerance?: number;
      }>
    | string;
  formName: string;
  formNo?: string;
  id: string;
  partName?: string;
  processName: string;
  projectName?: string;
  status: string;
  templateQuantity?: null | number;
  updatedAt: string;
  updatedBy?: string;
  workOrderNumber: string;
}

export interface InspectionFormMatchResult {
  hasTemplate: boolean;
  processName: string;
  template: null | {
    attachments?: string;
    drawingNo?: string;
    formFields?: Array<{
      acceptanceCriteria?: string;
      checkItem?: string;
      lowerTolerance?: number;
      standardValue?: number;
      unit?: string;
      upperTolerance?: number;
    }>;
    formName: string;
    formNo?: string;
    id: string;
    partName?: string;
    templateQuantity?: null | number;
    workOrderNumber: string;
  };
}

// Project Document type (local definition since not in shared)
export interface ProjectDocProject {
  createdAt: string;
  description?: string;
  documents?: ProjectDocumentLedgerItem[];
  id: string;
  projectName?: string;
  status?: 'active' | 'archived' | 'draft';
  updatedAt: string;
  workOrderNumber: string;
}

// Re-export shared types

/**
 * DFMEA Project APIs
 */
export async function getDfmeaProjectList() {
  const page = await getDfmeaProjectListPage();
  return page.items;
}

export async function getDfmeaProjectListPage() {
  return requestClient.get<QmsListResponse<DfmeaProject>>(
    '/qms/planning/dfmea/projects',
  );
}

export async function createDfmeaProject(data: Partial<DfmeaProject>) {
  return requestClient.post<DfmeaProject>('/qms/planning/dfmea/projects', data);
}

export async function updateDfmeaProject(
  id: string,
  data: Partial<DfmeaProject>,
) {
  return requestClient.put<DfmeaProject>(
    `/qms/planning/dfmea/projects/${id}`,
    data,
  );
}

export async function deleteDfmeaProject(id: string) {
  return requestClient.delete(`/qms/planning/dfmea/projects/${id}`);
}

export async function getDfmeaProjectStats(projectId: string) {
  return requestClient.get<DfmeaProjectStats>(
    `/qms/planning/dfmea/projects/${projectId}/stats`,
  );
}

/**
 * DFMEA Item APIs
 */
export async function getDfmeaTree() {
  return requestClient.get<DfmeaTreeNode[]>('/qms/planning/dfmea/tree');
}

export async function getDfmeaItemsByProject(projectId: string) {
  const page = await getDfmeaItemsByProjectPage(projectId);
  return page.items;
}

export async function getDfmeaItemsByProjectPage(projectId: string) {
  return requestClient.get<QmsListResponse<DfmeaItem>>('/qms/planning/dfmea', {
    params: { projectId },
  });
}

export async function createDfmea(data: Partial<DfmeaItem>) {
  return requestClient.post<DfmeaItem>('/qms/planning/dfmea', data);
}

export async function updateDfmea(id: string, data: Partial<DfmeaItem>) {
  return requestClient.put<DfmeaItem>(`/qms/planning/dfmea/${id}`, data);
}

export async function deleteDfmea(id: string) {
  return requestClient.delete(`/qms/planning/dfmea/${id}`);
}

/**
 * BOM Project APIs
 */
export async function getBomProjectList() {
  const page = await getBomProjectListPage();
  return page.items;
}

export async function getBomProjectListPage() {
  return requestClient.get<QmsListResponse<BomProject>>(
    '/qms/planning/bom/projects',
  );
}

export async function createBomProject(data: Partial<BomProject>) {
  return requestClient.post<BomProject>('/qms/planning/bom/projects', data);
}

export async function updateBomProject(id: string, data: Partial<BomProject>) {
  return requestClient.put<BomProject>(
    `/qms/planning/bom/projects/${id}`,
    data,
  );
}

export async function deleteBomProject(id: string) {
  return requestClient.delete(`/qms/planning/bom/projects/${id}`);
}

/**
 * Project Documents APIs
 */
export async function getProjectDocProjects() {
  const page = await getProjectDocProjectsPage();
  return page.items;
}

export async function getProjectDocProjectsPage() {
  return requestClient.get<QmsListResponse<ProjectDocProject>>(
    '/qms/planning/project-docs/projects',
  );
}

export async function getInspectionFormTemplateList(params?: {
  partName?: string;
  processName?: string;
  workOrderNumber?: string;
}) {
  const page = await getInspectionFormTemplateListPage(params);
  return page.items;
}

export async function getInspectionFormTemplateListPage(params?: {
  partName?: string;
  processName?: string;
  workOrderNumber?: string;
}) {
  return requestClient.get<QmsListResponse<InspectionFormTemplateItem>>(
    '/qms/planning/inspection-forms',
    { params },
  );
}

export async function createInspectionFormTemplate(
  data: Partial<InspectionFormTemplateItem> & {
    formFields?: Array<Record<string, unknown>>;
  },
) {
  return requestClient.post<InspectionFormTemplateItem>(
    '/qms/planning/inspection-forms',
    data,
  );
}

export async function updateInspectionFormTemplate(
  id: string,
  data: Partial<InspectionFormTemplateItem> & {
    formFields?: Array<Record<string, unknown>>;
  },
) {
  return requestClient.put<InspectionFormTemplateItem>(
    `/qms/planning/inspection-forms/${id}`,
    data,
  );
}

export async function deleteInspectionFormTemplate(id: string) {
  return requestClient.delete(`/qms/planning/inspection-forms/${id}`);
}

export async function matchInspectionFormTemplate(params: {
  category: string;
  incomingType?: string;
  partName?: string;
  processName?: string;
  workOrderNumber: string;
}) {
  return requestClient.get<InspectionFormMatchResult>(
    '/qms/planning/inspection-forms/match',
    { params },
  );
}

export async function createProjectDocProject(data: {
  workOrderNumber: string;
}) {
  return requestClient.post<ProjectDocProject>(
    '/qms/planning/project-docs/projects',
    data,
  );
}

export async function updateProjectDocProject(
  id: string,
  data: Partial<ProjectDocProject>,
) {
  return requestClient.put<ProjectDocProject>(
    `/qms/planning/project-docs/projects/${id}`,
    data,
  );
}

export async function deleteProjectDocProject(id: string) {
  return requestClient.delete(`/qms/planning/project-docs/projects/${id}`);
}

/**
 * BOM Item APIs
 */
export async function getBomTree() {
  return requestClient.get<BomTreeNode[]>('/qms/planning/bom/tree');
}

export async function getBomList(params?: { projectId?: string }) {
  const page = await getBomListPage(params);
  return page.items;
}

export async function getBomListPage(params?: { projectId?: string }) {
  return requestClient.get<QmsListResponse<BomItem>>('/qms/planning/bom', {
    params,
  });
}

export async function getBomProcessOptions() {
  return requestClient.get<Array<{ label: string; value: string }>>(
    '/qms/planning/bom/process-options',
  );
}

export async function createBom(data: Partial<BomItem>) {
  return requestClient.post<BomItem>('/qms/planning/bom', data);
}

export async function updateBom(id: string, data: Partial<BomItem>) {
  return requestClient.put<BomItem>(`/qms/planning/bom/${id}`, data);
}

export async function deleteBom(id: string) {
  return requestClient.delete(`/qms/planning/bom/${id}`);
}

export async function importBomItems(data: {
  items: Partial<BomItem>[];
  projectId: string;
}) {
  return requestClient.post<QmsImportSummary>('/qms/planning/bom/import', data);
}

/**
 * ITP Project APIs
 */
export async function getItpProjectList() {
  const page = await getItpProjectListPage();
  return page.items;
}

export async function getItpProjectListPage() {
  return requestClient.get<QmsListResponse<ItpProject>>(
    '/qms/planning/itp/projects',
  );
}

export async function createItpProject(data: Partial<ItpProject>) {
  return requestClient.post<ItpProject>('/qms/planning/itp/projects', data);
}

export async function updateItpProject(id: string, data: Partial<ItpProject>) {
  return requestClient.put<ItpProject>(
    `/qms/planning/itp/projects/${id}`,
    data,
  );
}

export async function deleteItpProject(id: string) {
  return requestClient.delete(`/qms/planning/itp/projects/${id}`);
}

/**
 * ITP Item APIs
 */
export async function getItpTree() {
  return requestClient.get<ItpTreeNode[]>('/qms/planning/itp/tree');
}

export async function getItpList(params?: { projectId?: string }) {
  const page = await getItpListPage(params);
  return page.items;
}

export async function getItpListPage(params?: { projectId?: string }) {
  return requestClient.get<QmsListResponse<ItpItem>>('/qms/planning/itp', {
    params,
  });
}

export async function createItp(data: Partial<ItpItem>) {
  return requestClient.post<ItpItem>('/qms/planning/itp', data);
}

export async function updateItp(id: string, data: Partial<ItpItem>) {
  return requestClient.put<ItpItem>(`/qms/planning/itp/${id}`, data);
}

export async function deleteItp(id: string, projectId: string) {
  return requestClient.delete(`/qms/planning/itp/${id}`, {
    params: { projectId },
  });
}

export namespace QmsPlanningApi {
  export type ItpProject = import('@qgs/shared').ItpProject;
  export type ItpItem = import('@qgs/shared').ItpItem;
  export type ItpTreeNode = import('@qgs/shared').ItpTreeNode;
  export type BomProject = import('@qgs/shared').BomProject;
  export type BomItem = import('@qgs/shared').BomItem;
  export type DfmeaProject = import('@qgs/shared').DfmeaProject;
  export type DfmeaItem = import('@qgs/shared').DfmeaItem;
}
export namespace QmsPlanningApi {
  export type BomTreeNode = import('@qgs/shared').BomTreeNode;
  export type DfmeaTreeNode = import('@qgs/shared').DfmeaTreeNode;
}
