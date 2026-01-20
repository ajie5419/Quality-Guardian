import { requestClient } from '#/api/request';

export namespace QmsTaskDispatchApi {
  export type TaskType = 'DFMEA_ACTION' | 'ITP_INSPECTION';
  export type TaskStatus =
    | 'COMPLETED'
    | 'DISPATCHED'
    | 'OVERDUE'
    | 'PENDING'
    | 'PROCESSING';

  /**
   * 任务内容详情
   */
  export interface TaskContent {
    description?: string;
    requirements?: string[];
    attachments?: string[];
    [key: string]: unknown;
  }

  export interface TaskDispatch {
    id: string;
    type: TaskType;
    title: string;
    level: number;
    parentId?: string;
    itpProjectId?: string;
    dfmeaId?: string;
    assignorId: string;
    assignorName?: string;
    assigneeId: string;
    assigneeName?: string;
    content?: TaskContent;
    status: TaskStatus;
    priority: number;
    deadline?: string;
    createdAt: string;
    updatedAt: string;
  }

  export interface CreateTaskParams {
    type: TaskType;
    title: string;
    level: number;
    parentId?: string;
    itpProjectId?: string;
    dfmeaId?: string;
    assigneeId: string;
    content?: TaskContent;
    priority?: number;
    deadline?: string;
  }
}

export async function getTaskList(params?: {
  all?: string;
  assigneeId?: string;
  level?: number;
  parentId?: string;
  status?: string;
}) {
  return requestClient.get<QmsTaskDispatchApi.TaskDispatch[]>(
    '/qms/task-dispatch',
    { params },
  );
}

export async function createTask(data: QmsTaskDispatchApi.CreateTaskParams) {
  return requestClient.post<QmsTaskDispatchApi.TaskDispatch>(
    '/qms/task-dispatch',
    data,
  );
}

export async function updateTaskStatus(
  id: string,
  status: QmsTaskDispatchApi.TaskStatus,
) {
  return requestClient.put(`/qms/task-dispatch/${id}/status`, { status });
}

export async function getTaskStats() {
  return requestClient.get<{
    overdue: number;
    pendingLevel1: number;
    pendingLevel2: number;
    processing: number;
  }>('/qms/task-dispatch/stats');
}
