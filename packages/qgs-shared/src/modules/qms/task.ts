export type TaskType = 'DFMEA_ACTION' | 'ITP_INSPECTION';
export type TaskStatus =
  | 'COMPLETED'
  | 'DISPATCHED'
  | 'OVERDUE'
  | 'PENDING'
  | 'PROCESSING';

/**
 * Task Content Detail
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
