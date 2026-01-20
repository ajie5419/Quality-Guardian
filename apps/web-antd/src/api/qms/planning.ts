import { requestClient } from '#/api/request';

export namespace QmsPlanningApi {
  // DFMEA 项目
  export interface DfmeaProject {
    id: string;
    projectName: string;
    workOrderId?: string;
    version: string;
    status: 'active' | 'archived' | 'draft';
    description?: string;
    createdAt: Date;
    updatedAt: Date;
    createdBy: string;
  }

  // DFMEA 条目
  export interface DfmeaItem {
    id: string;
    projectId: string;
    item: string;
    function: string;
    failureMode: string;
    effects: string;
    severity: number;
    occurrence: number;
    detection: number;
    rpn: number;
    order: number;
  }

  // 树形表格节点（用于前端显示）
  export interface DfmeaTreeNode {
    id: string;
    type: 'item' | 'project';
    parentId?: string;
    name: string;
    projectName?: string;
    failureMode?: string;
    effects?: string;
    severity?: number;
    occurrence?: number;
    detection?: number;
    rpn?: number;
    order?: number;
    // 项目级别统计
    itemCount?: number;
    avgRpn?: number;
    maxRpn?: number;
    riskLevel?: 'high' | 'low' | 'medium';
    // 项目信息
    version?: string;
    status?: string;
    children?: DfmeaTreeNode[];
  }

  // 项目统计
  export interface DfmeaProjectStats {
    projectId: string;
    projectName: string;
    itemCount: number;
    avgRpn: number;
    maxRpn: number;
    highRiskCount: number; // RPN > 100
    mediumRiskCount: number; // 50 < RPN <= 100
    lowRiskCount: number; // RPN <= 50
  }

  export interface BomProject {
    id: string;
    projectName: string;
    workOrderNumber: string;
    version: string;
    status: 'active' | 'archived' | 'draft';
    description?: string;
    createdAt: string;
    updatedAt: string;
    createdBy: string;
  }

  export interface BomItem {
    id: string;
    projectId: string;
    partNumber: string;
    partName: string;
    version: string;
    quantity: number;
    unit: string;
    material: string;
    remarks?: string;
  }

  export interface BomTreeNode {
    id: string;
    type: 'item' | 'project';
    parentId?: string;
    name: string;
    projectName?: string;
    workOrderNumber?: string;
    version?: string;
    status?: string;
    itemCount?: number;
    children?: BomTreeNode[];
    // Item specific
    partNumber?: string;
    quantity?: number;
    unit?: string;
    material?: string;
    remarks?: string;
  }

  export interface ItpProject {
    id: string;
    projectName: string;
    workOrderId?: string;
    customerName?: string;
    version: string;
    status: 'active' | 'archived' | 'draft';
    description?: string;
    createdAt: string;
    updatedAt: string;
    createdBy: string;
  }

  export interface ItpItem {
    id: string;
    projectId: string;
    bomItemId?: string; // 关联的 BOM 部件 ID
    processStep: string; // 工序/步骤
    activity: string; // 检验活动
    referenceDoc: string; // 参考文档/标准
    acceptanceCriteria: string; // 验收标准
    controlPoint: 'H' | 'R' | 'S' | 'W'; // 控制点类型
    frequency: string; // 检验频次
    verifyingDocument: string; // 验证记录
    // 定量化判定
    isQuantitative: boolean;
    // Old singular fields (kept for backward compatibility)
    standardValue?: number;
    upperTolerance?: number;
    lowerTolerance?: number;
    unit?: string;
    
    // New array field
    quantitativeItems?: {
      id?: string; // Optional for new items
      name?: string; // Optional name/description of the dimension (e.g. "Length", "Diameter")
      standardValue: number;
      upperTolerance: number;
      lowerTolerance: number;
      unit: string;
    }[];

    // 联动信息
    relatedKnowledgeId?: string;
    order: number;
  }

  export interface ItpTreeNode {
    id: string;
    type: 'item' | 'project';
    parentId?: string;
    bomItemId?: string;
    name: string;
    processStep?: string;
    controlPoint?: string;
    status?: string;
    version?: string;
    itemCount?: number;
    progress?: number;
    workOrderId?: string;
    children?: ItpTreeNode[];
    // ... include other ItpItem fields for node data
    activity?: string;
    referenceDoc?: string;
    acceptanceCriteria?: string;
    frequency?: string;
    verifyingDocument?: string;
    isQuantitative?: boolean;
    // Updated to match ItpItem
    quantitativeItems?: {
      id?: string;
      name?: string;
      standardValue: number;
      upperTolerance: number;
      lowerTolerance: number;
      unit: string;
    }[];
    // Legacy fields
    standardValue?: number;
    upperTolerance?: number;
    lowerTolerance?: number;
    unit?: string;

    relatedKnowledgeId?: string;
  }
}

/**
 * DFMEA Project APIs
 */
export async function getDfmeaProjectList() {
  return requestClient.get<QmsPlanningApi.DfmeaProject[]>(
    '/qms/planning/dfmea/projects',
  );
}

export async function createDfmeaProject(
  data: Partial<QmsPlanningApi.DfmeaProject>,
) {
  return requestClient.post<QmsPlanningApi.DfmeaProject>(
    '/qms/planning/dfmea/projects',
    data,
  );
}

export async function updateDfmeaProject(
  id: string,
  data: Partial<QmsPlanningApi.DfmeaProject>,
) {
  return requestClient.put<QmsPlanningApi.DfmeaProject>(
    `/qms/planning/dfmea/projects/${id}`,
    data,
  );
}

export async function deleteDfmeaProject(id: string) {
  return requestClient.delete(`/qms/planning/dfmea/projects/${id}`);
}

export async function getDfmeaProjectStats(projectId: string) {
  return requestClient.get<QmsPlanningApi.DfmeaProjectStats>(
    `/qms/planning/dfmea/projects/${projectId}/stats`,
  );
}

/**
 * DFMEA Item APIs
 */
export async function getDfmeaTree() {
  return requestClient.get<QmsPlanningApi.DfmeaTreeNode[]>(
    '/qms/planning/dfmea/tree',
  );
}

export async function getDfmeaItemsByProject(projectId: string) {
  return requestClient.get<QmsPlanningApi.DfmeaItem[]>(
    `/qms/planning/dfmea?projectId=${projectId}`,
  );
}

export async function createDfmea(data: Partial<QmsPlanningApi.DfmeaItem>) {
  return requestClient.post<QmsPlanningApi.DfmeaItem>(
    '/qms/planning/dfmea',
    data,
  );
}

export async function updateDfmea(
  id: string,
  data: Partial<QmsPlanningApi.DfmeaItem>,
) {
  return requestClient.put<QmsPlanningApi.DfmeaItem>(
    `/qms/planning/dfmea/${id}`,
    data,
  );
}

export async function deleteDfmea(id: string) {
  return requestClient.delete(`/qms/planning/dfmea/${id}`);
}

/**
 * BOM Project APIs
 */
export async function getBomProjectList() {
  return requestClient.get<QmsPlanningApi.BomProject[]>(
    '/qms/planning/bom/projects',
  );
}

export async function createBomProject(
  data: Partial<QmsPlanningApi.BomProject>,
) {
  return requestClient.post<QmsPlanningApi.BomProject>(
    '/qms/planning/bom/projects',
    data,
  );
}

export async function updateBomProject(
  id: string,
  data: Partial<QmsPlanningApi.BomProject>,
) {
  return requestClient.put<QmsPlanningApi.BomProject>(
    `/qms/planning/bom/projects/${id}`,
    data,
  );
}

export async function deleteBomProject(id: string) {
  return requestClient.delete(`/qms/planning/bom/projects/${id}`);
}

/**
 * BOM Item APIs
 */
export async function getBomTree() {
  return requestClient.get<QmsPlanningApi.BomTreeNode[]>(
    '/qms/planning/bom/tree',
  );
}

export async function getBomList(params?: { projectId?: string }) {
  return requestClient.get<QmsPlanningApi.BomItem[]>('/qms/planning/bom', {
    params,
  });
}

export async function createBom(data: Partial<QmsPlanningApi.BomItem>) {
  return requestClient.post<QmsPlanningApi.BomItem>('/qms/planning/bom', data);
}

export async function updateBom(
  id: string,
  data: Partial<QmsPlanningApi.BomItem>,
) {
  return requestClient.put<QmsPlanningApi.BomItem>(
    `/qms/planning/bom/${id}`,
    data,
  );
}

export async function deleteBom(id: string) {
  return requestClient.delete(`/qms/planning/bom/${id}`);
}

/**
 * ITP Project APIs
 */
export async function getItpProjectList() {
  return requestClient.get<QmsPlanningApi.ItpProject[]>(
    '/qms/planning/itp/projects',
  );
}

export async function createItpProject(
  data: Partial<QmsPlanningApi.ItpProject>,
) {
  return requestClient.post<QmsPlanningApi.ItpProject>(
    '/qms/planning/itp/projects',
    data,
  );
}

export async function updateItpProject(
  id: string,
  data: Partial<QmsPlanningApi.ItpProject>,
) {
  return requestClient.put<QmsPlanningApi.ItpProject>(
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
  return requestClient.get<QmsPlanningApi.ItpTreeNode[]>(
    '/qms/planning/itp/tree',
  );
}

export async function getItpList(params?: { projectId?: string }) {
  return requestClient.get<QmsPlanningApi.ItpItem[]>('/qms/planning/itp', {
    params,
  });
}

export async function createItp(data: Partial<QmsPlanningApi.ItpItem>) {
  return requestClient.post<QmsPlanningApi.ItpItem>('/qms/planning/itp', data);
}

export async function updateItp(
  id: string,
  data: Partial<QmsPlanningApi.ItpItem>,
) {
  return requestClient.put<QmsPlanningApi.ItpItem>(
    `/qms/planning/itp/${id}`,
    data,
  );
}

export async function deleteItp(id: string, projectId: string) {
  return requestClient.delete(`/qms/planning/itp/${id}?projectId=${projectId}`);
}
