import { InspectionIssueStatusEnum } from './enums';

export interface InspectionIssue {
  claim: string; // 索赔
  defectSubtype?: string;
  defectType?: string;
  description: string;
  division?: string;
  id: string;
  inspector: string; // 检验员 (New standard)
  ncNumber: string; // 不合格编号
  partName: string; // 部件名称
  photos: string[]; // 问题照片
  isClaim: boolean; // 是否索赔
  lossAmount: number; // 损失金额
  projectName: string; // 项目名称
  quantity: number; // 数量
  reportDate: string;
  reportedBy: string; // 检验员 (Legacy?)
  responsibleDepartment: string; // 责任部门
  rootCause: string; // 原因分析
  severity: 'Critical' | 'Major' | 'Minor';
  solution: string; // 解决方案
  status: 'Closed' | 'Open' | 'Resolved' | InspectionIssueStatusEnum;
  supplierName?: string; // 供应商名称
  title: string;
  updatedAt: string; // 最后编辑时间
  date: string; // 发现日期 (from Prisma date field)
  workOrderNumber: string; // 工单号
}

export interface IncomingInspection {
  hasDocuments: string;
  id: string;
  inspector: string;
  materialName: string;
  quantity: number;
  remarks?: string;
  reportDate: string;
  reporter: string;
  supplierName: string;
}

export interface ProcessInspection {
  archived: string;
  componentName: string;
  id: string;
  inspector: string;
  level1Component: string;
  level2Component?: string;
  process: string;
  quantity: number;
  remarks?: string;
  reporter: string;
  team: string;
  workOrderNumber: string;
}

export interface ShipmentInspection {
  documents: string;
  id: string;
  inspector: string;
  packingListArchived: string;
  projectName: string;
  quantity: number;
  remarks?: string;
  reportDate: string;
  reporter: string;
  workOrderNumber: string;
}

export interface InspectionTaskResult {
  activity: string;
  controlPoint: string;
  isQuantitative: boolean;
  itpItemId: string;
  lowerTolerance?: number;
  measuredValue?: number;
  photoUrl?: string;
  remarks?: string;
  result: 'FAIL' | 'NA' | 'PASS';
  standardValue?: number;
  unit?: string;
  upperTolerance?: number;
}

export interface DetailedInspectionRecord {
  createdAt: string;
  id: string;
  inspector: string;
  itpProjectId?: string;
  overallResult: 'FAIL' | 'PASS';
  projectName?: string;
  remarks?: string;
  reportDate: string;
  results: InspectionTaskResult[];
  status: 'COMPLETED' | 'DRAFT';
  type: 'FINAL' | 'INCOMING' | 'OUTGOING' | 'PROCESS';
  updatedAt: string;
  workOrderNumber: string;
}

export type InspectionRecord =
  | DetailedInspectionRecord
  | IncomingInspection
  | ProcessInspection
  | ShipmentInspection;
