import { InspectionIssueStatusEnum } from './enums';

export interface InspectionIssue {
  claim: string; // 索赔
  date: string; // 发现日期 (from Prisma date field)
  defectSubtype?: string;
  defectType?: string;
  description: string;
  division?: string;
  id: string;
  inspectionId?: string;
  inspector: string; // 检验员 (New standard)
  isClaim: boolean; // 是否索赔
  lossAmount: number; // 损失金额
  ncNumber: string; // 不合格编号
  partName: string; // 部件名称
  photos: string[]; // 问题照片
  photoThumbUrl?: string; // 缩略图地址（列表展示）
  projectName: string; // 项目名称
  quantity: number; // 数量
  reportDate: string;
  reportedBy: string; // 检验员 (Legacy?)
  responsibleDepartment: string; // 责任部门
  responsibleWelder?: string; // 责任焊工
  rootCause: string; // 原因分析
  severity: 'Critical' | 'Major' | 'Minor';
  solution: string; // 解决方案
  status: 'Closed' | 'Open' | 'Resolved' | InspectionIssueStatusEnum;
  supplierName?: string; // 供应商名称
  title: string;
  updatedAt: string; // 最后编辑时间
  workOrderNumber: string; // 工单号
}

export interface IncomingInspection {
  archiveDueAt?: string;
  archiveIsOverdue?: boolean;
  archiveTaskId?: null | string;
  archiveTaskStatus?:
    | 'ARCHIVED'
    | 'IN_PROGRESS'
    | 'PENDING'
    | 'REJECTED'
    | null;
  hasDocuments: string;
  id: string;
  inspector: string;
  issueStatus?: string;
  materialName: string;
  qualifiedQuantity?: number;
  quantity: number;
  remarks?: string;
  reportDate: string;
  reporter: string;
  supplierName: string;
  templateId?: string;
  templateName?: string;
  unqualifiedQuantity?: number;
}

export interface ProcessInspection {
  archived: string;
  archiveDueAt?: string;
  archiveIsOverdue?: boolean;
  archiveTaskId?: null | string;
  archiveTaskStatus?:
    | 'ARCHIVED'
    | 'IN_PROGRESS'
    | 'PENDING'
    | 'REJECTED'
    | null;
  componentName: string;
  id: string;
  inspector: string;
  issueStatus?: string;
  level1Component: string;
  level2Component?: string;
  process: string;
  qualifiedQuantity?: number;
  quantity: number;
  remarks?: string;
  reporter: string;
  team: string;
  templateId?: string;
  templateName?: string;
  unqualifiedQuantity?: number;
  workOrderNumber: string;
}

export interface ShipmentInspection {
  archiveDueAt?: string;
  archiveIsOverdue?: boolean;
  archiveTaskId?: null | string;
  archiveTaskStatus?:
    | 'ARCHIVED'
    | 'IN_PROGRESS'
    | 'PENDING'
    | 'REJECTED'
    | null;
  documents: string;
  id: string;
  inspector: string;
  issueStatus?: string;
  packingListArchived: string;
  projectName: string;
  qualifiedQuantity?: number;
  quantity: number;
  remarks?: string;
  reportDate: string;
  reporter: string;
  templateId?: string;
  templateName?: string;
  unqualifiedQuantity?: number;
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
  templateId?: string;
  templateName?: string;
  type: 'FINAL' | 'INCOMING' | 'OUTGOING' | 'PROCESS';
  updatedAt: string;
  workOrderNumber: string;
}

export type InspectionRecord =
  | DetailedInspectionRecord
  | IncomingInspection
  | ProcessInspection
  | ShipmentInspection;
