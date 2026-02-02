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

import { requestClient } from '#/api/request';

// Project Document type (local definition since not in shared)
export interface ProjectDocProject {
  createdAt: string;
  description?: string;
  id: string;
  projectName?: string;
  status?: 'active' | 'archived' | 'draft';
  updatedAt: string;
  workOrderNumber: string;
}

// Re-export shared types
export * from '@qgs/shared';

/**
 * DFMEA Project APIs
 */
export async function getDfmeaProjectList() {
  return requestClient.get<DfmeaProject[]>('/qms/planning/dfmea/projects');
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
  return requestClient.get<DfmeaItem[]>('/qms/planning/dfmea', {
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
  return requestClient.get<BomProject[]>('/qms/planning/bom/projects');
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
  return requestClient.get<ProjectDocProject[]>(
    '/qms/planning/project-docs/projects',
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

/**
 * BOM Item APIs
 */
export async function getBomTree() {
  return requestClient.get<BomTreeNode[]>('/qms/planning/bom/tree');
}

export async function getBomList(params?: { projectId?: string }) {
  return requestClient.get<BomItem[]>('/qms/planning/bom', {
    params,
  });
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

/**
 * ITP Project APIs
 */
export async function getItpProjectList() {
  return requestClient.get<ItpProject[]>('/qms/planning/itp/projects');
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
  return requestClient.get<ItpItem[]>('/qms/planning/itp', {
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
