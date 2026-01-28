import type { CreateTaskParams, TaskDispatch, TaskStatus } from '@qgs/shared';

import { requestClient } from '#/api/request';

// Re-export shared types
export * from '@qgs/shared';

export async function getTaskList(params?: {
  all?: string;
  assigneeId?: string;
  level?: number;
  parentId?: string;
  status?: string;
}) {
  return requestClient.get<TaskDispatch[]>('/qms/task-dispatch', { params });
}

export async function createTask(data: CreateTaskParams) {
  return requestClient.post<TaskDispatch>('/qms/task-dispatch', data);
}

export async function updateTaskStatus(id: string, status: TaskStatus) {
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

export namespace QmsTaskDispatchApi {
  export type TaskDispatch = import('@qgs/shared').TaskDispatch;
  export type CreateTaskParams = import('@qgs/shared').CreateTaskParams;
}
