import { requestClient } from '#/api/request';

import { QMS_API } from './constants';

export interface WorkspaceProjectItem {
  color: string;
  confirmedRequirements: number;
  content: string;
  date: string;
  group: string;
  icon: string;
  id: string;
  overdueUnconfirmedRequirements: number;
  plannedRequirements: number;
  title: string;
  url: string;
}

export interface WorkspaceTodoItem {
  completed: boolean;
  content: string;
  date: string;
  id: string;
  title: string;
}

export interface WorkspaceTrendItem {
  avatar: string;
  content: string;
  date: string;
  title: string;
}

export interface WorkspaceDataResponse {
  projectItems: WorkspaceProjectItem[];
  stats: {
    openIssuesCount: number;
    todayInspections: number;
    todayIssues: number;
    todayWorkOrders: number;
  };
  todoItems: WorkspaceTodoItem[];
  trendItems: WorkspaceTrendItem[];
}

export interface WorkOrderRequirementAttachment {
  name?: string;
  thumbUrl?: string;
  type?: string;
  url: string;
}

export interface WorkspaceWorkOrderAggregateResponse {
  byPart: Array<{
    completionRate: number;
    inspectedPoints: number;
    missingPoints: number;
    partName: string;
    plannedPoints: number;
  }>;
  byProcess: Array<{
    completionRate: number;
    inspectedPoints: number;
    missingPoints: number;
    plannedPoints: number;
    processName: string;
  }>;
  inspectionWorksToday: Array<{
    inspector: string;
    partName: string;
    processName: string;
    quantity: number;
    result: string;
    workOrderNumber: string;
  }>;
  productionProgress: {
    outsourced: Array<{
      date: string;
      id: string;
      materialName: string;
    }>;
    process: Array<{
      coveredQuantity: number;
      date: string;
      id: string;
      latestDate: string;
      partName: string;
      processes: Array<{
        completedQuantity: number;
        latestDate: string;
        processName: string;
        status: 'COMPLETE' | 'PARTIAL';
        totalQuantity: number;
      }>;
      teams: string[];
      totalQuantity: number;
    }>;
  };
  missingDetails: Array<{
    inspectedPoints: number;
    missingPoints: number;
    partName: string;
    plannedPoints: number;
    processName: string;
    status: 'NOT_STARTED' | 'PARTIAL';
  }>;
  requirements: Array<{
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
    partName: string;
    plannedPoints: number;
    processName: string;
    requirementName: string;
    responsiblePerson: string;
    responsibleTeam: string;
    status: 'EXECUTED' | 'NOT_EXECUTED';
    workOrderNumber: string;
  }>;
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

export async function getWorkspaceData() {
  return requestClient.get<WorkspaceDataResponse>(QMS_API.WORKSPACE);
}

export async function getWorkspaceWorkOrderAggregate(params: {
  workOrderNumber: string;
}) {
  return requestClient.get<WorkspaceWorkOrderAggregateResponse>(
    QMS_API.WORKSPACE_WORK_ORDER_AGGREGATE,
    { params },
  );
}
