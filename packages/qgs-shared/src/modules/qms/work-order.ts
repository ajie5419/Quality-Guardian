export interface WorkOrderItem {
  confirmedRequirements?: number;
  createTime: null | string;
  customerName: null | string;
  deliveryDate: null | string;
  division?: null | string;
  effectiveTime?: null | string;
  id: string; // workOrderNumber
  overdueUnconfirmedRequirements?: number;
  plannedRequirements?: number;
  projectName?: null | string;
  quantity: null | number;
  status: string;
  warrantyStatus?: null | string;
  workOrderNumber: string;
}

export type WorkOrderDetail = WorkOrderItem;

export interface WorkOrderParams {
  dataScope?: unknown;
  endDate?: string;
  granularity?: string;
  ids?: string[];
  ignoreYearFilter?: boolean;
  keyword?: string;
  page?: number;
  pageSize?: number;
  productName?: string;
  projectName?: string;
  startDate?: string;
  status?: string;
  userContext?: { userId: string; username?: string };
  workOrderNumber?: string;
  year?: number;
}

export interface WorkOrderSummaryItem {
  division?: null | string;
  quantity: null | number;
  status: string;
}

export interface WorkOrderListResult {
  items: WorkOrderItem[];
  summary: WorkOrderSummaryItem[];
  total: number;
}

export type WorkOrderPageResult = WorkOrderListResult;

export interface WorkOrderDashboardStats {
  completed: number;
  inProgress: number;
  pieData: Array<{ name: string; value: number }>;
  progressPercent: number;
  rankings: Array<{
    division: string;
    productName: string;
    productNames: string[];
    warrantyCount: number;
  }>;
  total: number;
}

export interface WorkOrderDashboardSummary {
  recentWorkOrders: Array<{
    customerName?: null | string;
    projectName?: null | string;
    status: string;
    workOrderNumber: string;
  }>;
  totalCount: number;
  weeklyCount: number;
}
