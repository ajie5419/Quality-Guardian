/**
 * 质量问题管理模块类型定义
 */

import type { UploadFile } from 'ant-design-vue';

import { InspectionIssueStatusEnum } from '#/api/qms/enums';

/**
 * 问题状态枚举 (重命名导出以保持一致性)
 */
export const IssueStatus = InspectionIssueStatusEnum;
export type IssueStatus = InspectionIssueStatusEnum;

/**
 * 索赔状态枚举
 */
export enum ClaimStatus {
  NO = 'No',
  YES = 'Yes',
}

/**
 * 严重程度枚举
 */
export enum Severity {
  CRITICAL = 'Critical',
  MAJOR = 'Major',
  MINOR = 'Minor',
}

/**
 * 部门类型枚举
 */
export enum DeptType {
  OUTSOURCED = '外协',
  PRODUCTION = '履约',
  PURCHASE = '采购',
}

/**
 * 缺陷类型
 */
export enum DefectType {
  DESIGN = '设计缺陷',
  MANUFACTURING = '制造缺陷',
  OTHER = '其他缺陷',
  PART = '零部件缺陷',
  PROCESS = '工艺缺陷',
}

/**
 * 质量问题实体
 */
export interface InspectionIssue {
  id: string;
  ncNumber: string;
  reportDate: string;
  workOrderNumber: string;
  projectName: string;
  partName: string;
  description: string;
  quantity: number;
  defectType?: string;
  defectSubtype?: string;
  rootCause?: string;
  solution?: string;
  lossAmount: number;
  responsibleDepartment: string;
  supplierName?: string;
  status: 'Closed' | 'Open' | 'Resolved' | IssueStatus;
  claim: ClaimStatus | string;
  photos: string[];
  severity: 'Critical' | 'Major' | 'Minor' | Severity;
  inspector: string;
  division?: string;
  updatedAt?: string;
}

/**
 * 部门树节点
 */
export interface DeptNode {
  id: string;
  label: string;
  value: string;
  children?: DeptNode[];
}

/**
 * 工单项
 */
export interface WorkOrderItem {
  id: string;
  workOrderNumber: string;
  projectName?: string;
  division?: string;
}

/**
 * 供应商项
 */
export interface SupplierItem {
  id: string;
  name: string;
  type: string;
}

/**
 * 上传文件（带响应）
 */
export interface UploadFileWithResponse extends Omit<UploadFile, 'response'> {
  response?: {
    data: {
      url: string;
    };
  };
}

/**
 * 问题表单状态
 */
export interface IssueFormState
  extends Omit<Partial<InspectionIssue>, 'photos'> {
  divisionId?: string;
  photos?: UploadFileWithResponse[];
  responsibleDepartmentId?: string;
}

/**
 * 统计数据
 */
export interface StatisticsData {
  totalCount: number;
  openCount: number;
  closedCount: number;
  totalLoss: number;
  closedRate: number;
  pieData: PieDataItem[];
  trendData: TrendDataItem[];
  pareto: ParetoDataItem[];
}

/**
 * 饼图数据项
 */
export interface PieDataItem {
  name: string;
  value: number;
}

/**
 * 趋势数据项
 */
export interface TrendDataItem {
  period: string;
  value: number;
}

/**
 * 帕累托数据项
 */
export interface ParetoDataItem {
  label: string;
  value: number;
  percent: number;
  cumulativePercent: number;
}

/**
 * 相似案例
 */
export interface MatchedCase {
  id: string;
  title: string;
  description: string;
  rootCause?: string;
  solution?: string;
  similarity: number;
}

/**
 * AI 洞洞察报告参数
 */
export interface GenerateQualityInsightParams {
  statistics: {
    passRate: number;
    qualityLoss: number;
    topDefects: Array<{
      count: number;
      percentage: number;
      type: string;
    }>;
    totalInspections: number;
    trendData: Array<{
      period: string;
      value: number;
    }>;
  };
  year: number;
}

/**
 * AI 洞洞察报告响应
 */
export interface GenerateQualityInsightResponse {
  report: string;
}
