export type SupervisionIssueStatus =
  | 'CLOSED'
  | 'IN_PROGRESS'
  | 'OPEN'
  | 'VERIFYING';

export type SupervisionProjectStatus =
  | 'COMPLETED'
  | 'IN_PROGRESS'
  | 'PAUSED'
  | 'PLANNED';

export type SupervisionProjectType = 'BRIDGE' | 'MOLD' | 'VEHICLE';

export interface SupervisionProject {
  actualEndAt?: string;
  actualStartAt?: string;
  closedIssueCount?: number;
  createdAt?: string;
  id: string;
  latestReportDate?: string;
  location?: string;
  openIssueCount?: number;
  participants: string[];
  plannedEndAt?: string;
  plannedStartAt?: string;
  progressPercent: number;
  projectName: string;
  projectType: SupervisionProjectType;
  riskLevel: string;
  stage?: string;
  status: SupervisionProjectStatus;
  summary?: string;
  supervisor?: string;
  supplierName?: string;
  totalIssueCount?: number;
  updatedAt?: string;
  workOrderNumber?: string;
}

export type SupervisionPlanTaskStatus =
  | 'DELAYED'
  | 'DONE'
  | 'DUE_SOON'
  | 'IN_PROGRESS'
  | 'NOT_STARTED'
  | 'RISK';

export interface SupervisionPlanTask {
  actualEndAt?: string;
  actualStartAt?: string;
  completedQuantity: number;
  createdAt?: string;
  durationDays?: number;
  durationText?: string;
  id: string;
  isSummary: boolean;
  lastReportAt?: string;
  lastReportId?: string;
  outlineLevel: number;
  outlineNumber?: string;
  parentId?: string;
  plannedEndAt?: string;
  plannedQuantity: number;
  plannedStartAt?: string;
  predecessorText?: string;
  progressPercent: number;
  projectId: string;
  quantityUnit: string;
  resourceName?: string;
  riskLevel?: string;
  riskReason?: string;
  sortOrder: number;
  sourceFileName?: string;
  sourceFileUrl?: string;
  status: SupervisionPlanTaskStatus;
  taskName: string;
  taskNo: string;
  updatedAt?: string;
  weight: number;
}

export interface SupervisionPlanTaskNode extends SupervisionPlanTask {
  children: SupervisionPlanTaskNode[];
}

export interface SupervisionPlanTaskSummary {
  delayed: number;
  done: number;
  dueSoon: number;
  inProgress: number;
  notStarted: number;
  progressPercent: number;
  total: number;
}

export interface SupervisionPlanTaskImportResult {
  items: SupervisionPlanTask[];
  summary: SupervisionPlanTaskSummary;
  tree: SupervisionPlanTaskNode[];
}

export interface DeadlineBoardTask extends SupervisionPlanTask {
  projectName: string;
  supplierName: string;
}

export interface DeadlineBoardProjectSummary {
  delayedCount: number;
  dueSoonCount: number;
  overallProgress: number;
  projectId: string;
  projectName: string;
  riskCount: number;
  supplierName: string;
}

export interface DeadlineBoardResult {
  byProject: DeadlineBoardProjectSummary[];
  delayed: DeadlineBoardTask[];
  dueSoon: DeadlineBoardTask[];
  risk: DeadlineBoardTask[];
  summary: {
    delayedCount: number;
    dueSoonCount: number;
    healthyPercent: number;
    riskCount: number;
    totalProjects: number;
  };
}

export interface SupervisionDailyReport {
  attachments: string[];
  completedMilestone?: string;
  coordinationNeeded?: string;
  createdAt?: string;
  id: string;
  issueSummary?: string;
  location?: string;
  manpower?: string;
  progressPercent: number;
  projectId: string;
  projectName?: string;
  reportDate: string;
  reporter: string;
  taskUpdates?: SupervisionReportTaskUpdate[];
  tomorrowPlan?: string;
  updatedAt?: string;
  weather?: string;
  workContent?: string;
  workOrderNumber?: string;
}

export interface SupervisionReportTaskUpdate {
  completedQuantity?: number;
  createdAt?: string;
  /**
   * Real-time status from the linked supervision_plan_tasks record,
   * calculated by calculatePlanTaskStatus at the time the report is fetched.
   * Distinct from `status`, which is the snapshot saved at submission time.
   * Falls back to `status` when the linked plan task has been deleted.
   */
  currentTaskStatus?: SupervisionPlanTaskStatus;
  dailyQuantity?: number;
  id?: string;
  nextPlan?: string;
  photos?: string[];
  plannedQuantity?: number;
  progressPercent: number;
  projectId?: string;
  quantityUnit?: string;
  reportId?: string;
  riskReason?: string;
  status: SupervisionPlanTaskStatus;
  taskId: string;
  taskName?: string;
  taskNo?: string;
  workContent?: string;
}

export interface SupervisionIssue {
  affectsProgress: boolean;
  closedAt?: string;
  correctiveAction?: string;
  createdAt?: string;
  createdBy?: string;
  description: string;
  dueAt?: string;
  estimatedLoss: number;
  id: string;
  isClaim: boolean;
  issueNo: string;
  issueType: string;
  photos: string[];
  projectId: string;
  projectName?: string;
  rectificationPhotos: string[];
  responsibleUnit?: string;
  severity: string;
  status: SupervisionIssueStatus;
  taskId?: string;
  updatedAt?: string;
  verifyResult?: string;
}

export interface SupervisionIssueAction {
  actionType: string;
  attachments: string[];
  createdAt?: string;
  createdBy?: string;
  description?: string;
  id: string;
  issueId: string;
}

export interface SupervisionProjectParams {
  keyword?: string;
  page?: number;
  pageSize?: number;
  projectType?: SupervisionProjectType;
  status?: SupervisionProjectStatus;
  supplierName?: string;
}

export interface SupervisionIssueParams {
  issueType?: string;
  page?: number;
  pageSize?: number;
  projectId?: string;
  status?: SupervisionIssueStatus;
}

export interface SupervisionReportParams {
  page?: number;
  pageSize?: number;
  projectId?: string;
}
