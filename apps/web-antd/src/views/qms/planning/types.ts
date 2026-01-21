import type { ProjectStatusEnum } from '#/api/qms/enums';

/**
 * 统一种类树节点基础接口
 */
export interface PlanningTreeNode {
  id: string;
  name: string;
  status: ProjectStatusEnum | string;
  version?: string;
  workOrderNumber?: string;
  parentId?: null | string;
  children?: PlanningTreeNode[];
  itemCount?: number;
  [key: string]: unknown;
}

/**
 * BOM 表单状态
 */
export interface BomFormState {
  material: string;
  partName: string;
  partNumber: string;
  quantity: number;
  remarks: string;
  unit: string;
  workOrderNumber: string;
}

/**
 * ITP 项目表单
 */
export interface ItpProjectForm {
  projectName: string;
  workOrderId: string;
  version: string;
  status: 'active' | 'archived' | 'draft';
}

/**
 * 项目过滤参数
 */
export interface ProjectFilterParams {
  activeTab: ProjectStatusEnum | string;
  searchText: string;
}

/**
 * ITP 定量指标接口
 */
export interface QuantitativeItem {
  standardValue: number;
  upperTolerance: number;
  lowerTolerance: number;
  unit: string;
}

/**
 * 检验记录文档接口
 */
export interface InspectionDocItem {
  id: string;
  category: string;
  name: string;
  inspector: string;
  supplier: string;
  status: string;
  reportDate: string;
}

/**
 * 侧边栏项点击回调
 */
export type OnSelectProject = (id: null | string) => void;
