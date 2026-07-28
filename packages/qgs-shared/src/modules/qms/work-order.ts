import type {
  IdentityAggregateItem,
  IdentityResolutionStatus,
} from '../../domain-modules/qms/identity-aggregate';

export interface WorkOrderItem {
  confirmedRequirements?: number;
  createTime: null | string;
  customerName: null | string;
  deliveryDate: null | string;
  division?: null | string;
  divisionId?: null | string;
  effectiveTime?: null | string;
  id: string; // workOrderNumber
  multiStationEnabled?: boolean;
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
  pieData: IdentityAggregateItem[];
  progressPercent: number;
  rankings: Array<{
    division: IdentityAggregateItem;
    projects: IdentityAggregateItem[];
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

export interface WorkOrderAggregateIdentity {
  id: null | string;
  name: string;
  resolutionStatus: IdentityResolutionStatus;
}

export interface WorkOrderRequirementAttachment {
  name?: string;
  thumbUrl?: string;
  type?: string;
  url: string;
}

interface WorkOrderAggregatePartFields {
  partId: null | string;
  partName: string;
  partResolutionStatus: IdentityResolutionStatus;
}

interface WorkOrderAggregateProcessFields {
  processId: null | string;
  processName: string;
  processResolutionStatus: IdentityResolutionStatus;
}

export interface WorkspaceWorkOrderAggregateResponse {
  byPart: Array<
    WorkOrderAggregatePartFields & {
      completionRate: number;
      inspectedPoints: number;
      missingPoints: number;
      plannedPoints: number;
    }
  >;
  byProcess: Array<
    WorkOrderAggregateProcessFields & {
      completionRate: number;
      inspectedPoints: number;
      missingPoints: number;
      plannedPoints: number;
    }
  >;
  inspectionWorksToday: Array<
    WorkOrderAggregatePartFields &
      WorkOrderAggregateProcessFields & {
        inspector: string;
        quantity: number;
        result: string;
        workOrderNumber: string;
      }
  >;
  missingDetails: Array<
    WorkOrderAggregatePartFields &
      WorkOrderAggregateProcessFields & {
        inspectedPoints: number;
        missingPoints: number;
        plannedPoints: number;
        status: 'NOT_STARTED' | 'PARTIAL';
      }
  >;
  productionProgress: {
    outsourced: Array<{ date: string; id: string; materialName: string }>;
    process: Array<
      WorkOrderAggregatePartFields & {
        coveredQuantity: number;
        date: string;
        id: string;
        latestDate: string;
        processes: Array<
          WorkOrderAggregateProcessFields & {
            completedQuantity: number;
            latestDate: string;
            status: 'COMPLETE' | 'PARTIAL';
            totalQuantity: number;
          }
        >;
        teams: WorkOrderAggregateIdentity[];
        totalQuantity: number;
      }
    >;
  };
  requirements: Array<
    WorkOrderAggregatePartFields &
      WorkOrderAggregateProcessFields & {
        attachments: WorkOrderRequirementAttachment[];
        confirmedAt?: null | string;
        confirmer: string;
        confirmStatus: string;
        createdAt: string;
        executed: boolean;
        executedPoints: number;
        executionStatus:
          | 'CONFIRMED'
          | 'EXECUTED_PENDING_CONFIRM'
          | 'MANUAL_CONFIRMED'
          | 'NOT_EXECUTED';
        executor: string;
        id: string;
        items: unknown[];
        plannedPoints: number;
        requirementName: string;
        responsiblePerson: string;
        responsibleTeam: string;
        responsibleTeamId: string;
        status: 'EXECUTED' | 'NOT_EXECUTED';
        workOrderNumber: string;
      }
  >;
  summary: {
    checkedParts: number;
    completionRate: number;
    confirmedRequirements: number;
    executedRequirements: number;
    inspectedPoints: number;
    missingPoints: number;
    overdueUnconfirmedRequirements: number;
    pendingConfirmRequirements: number;
    pendingRequirements: number;
    plannedPoints: number;
    plannedRequirements: number;
    totalParts: number;
    unattributedInspectedPoints: number;
  };
  workOrder: {
    customerName: string;
    division: string;
    projectName: string;
    quantity: number;
    status: string;
    workOrderNumber: string;
  };
}
