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
  [key: string]: unknown;
  attachments?: string[];
  description?: string;
  requirements?: string[];
}

export interface TaskDispatch {
  assigneeId: string;
  assigneeName?: string;
  assignorId: string;
  assignorName?: string;
  content?: TaskContent;
  createdAt: string;
  deadline?: string;
  dfmeaId?: string;
  id: string;
  itpProjectId?: string;
  level: number;
  parentId?: string;
  priority: number;
  status: TaskStatus;
  title: string;
  type: TaskType;
  updatedAt: string;
}

export interface CreateTaskParams {
  assigneeId: string;
  content?: TaskContent;
  deadline?: string;
  dfmeaId?: string;
  itpProjectId?: string;
  level: number;
  parentId?: string;
  priority?: number;
  title: string;
  type: TaskType;
}
