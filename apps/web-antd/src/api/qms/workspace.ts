import type { WorkspaceWorkOrderAggregateResponse } from '@qgs/shared';

import { requestClient } from '#/api/request';

import { QMS_API } from './constants';

export type {
  WorkOrderRequirementAttachment,
  WorkspaceWorkOrderAggregateResponse,
} from '@qgs/shared';

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
