import { InspectionIssueStatusEnum } from './enums';

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
