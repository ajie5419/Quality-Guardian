import type { IdentityAggregateItem } from '../../domain-modules/qms/identity-aggregate';

export interface QualityLossItem {
  actualClaim: number;
  amount: number;
  createdAt?: string;
  date: null | string;
  description?: string;
  id: string; // 界面显示的 ID (e.g. INT-1, EXT-5)
  lossSource: string;
  partId?: null | string;
  partName: null | string;
  pk: string; // 数据库主键 ID
  projectId?: null | string;
  projectName: null | string;
  responsibleDepartment: null | string;
  responsibleDepartmentCanonicalName?: null | string;
  responsibleDepartmentId?: null | string;
  responsibleDepartmentResolutionReason?:
    | 'CONFLICTED'
    | 'INVALID_REFERENCE'
    | 'MISSING_REQUIRED'
    | 'NOT_APPLICABLE';
  responsibleDepartmentResolutionStatus?: 'INVALID' | 'MISSING' | 'RESOLVED';
  status: string;
  type?: string;
  workOrderNumber: null | string;
}

export type QualityLossDetail = QualityLossItem;

export interface QualityLossParams {
  granularity?: 'month' | 'week' | 'year';
  lossSource?: string;
  page?: number;
  pageSize?: number;
  status?: string;
  userContext?: { userId: string; username?: string };
  workOrderNumber?: string;
  year?: number;
}

export interface QualityLossPageResult {
  items: QualityLossItem[];
  total: number;
}

export interface QualityLossDashboardSummary {
  kpi: {
    displayRate: string;
    pendingAmount: number;
    recoveryRate: number;
    totalAmount: number;
    totalClaim: number;
  };
  years: number[];
}

export interface QualityLossCharts {
  deptDistribution: IdentityAggregateItem[];
  trend: Array<{
    claimAmount: number;
    period: number;
    periodLabel: string;
    totalAmount: number;
  }>;
}

export interface QualityLossServiceTrendItem {
  commissioningAmount?: number;
  externalAmount: number;
  internalAmount: number;
  manualAmount: number;
  period: string;
  totalAmount: number;
}
