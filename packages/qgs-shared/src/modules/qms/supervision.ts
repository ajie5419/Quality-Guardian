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
  planDelayedStepCount?: number;
  planDoneStepCount?: number;
  planDueSoonStepCount?: number;
  plannedEndAt?: string;
  plannedStartAt?: string;
  planStepCount?: number;
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

export interface SupervisionMilestone {
  acceptanceRecord?: string[];
  actualAt?: string;
  createdAt?: string;
  delayReason?: string;
  id: string;
  name: string;
  plannedAt?: string;
  projectId: string;
  sortOrder: number;
  status: string;
  updatedAt?: string;
}

export interface SupervisionPlanStep {
  actualAt?: string;
  createdAt?: string;
  id: string;
  plannedAt?: string;
  remark?: string;
  rowId: string;
  sortOrder: number;
  status: string;
  stepName: string;
  updatedAt?: string;
}

export interface SupervisionPlanRow {
  createdAt?: string;
  id: string;
  projectId: string;
  quantity: number;
  remark?: string;
  segmentCode: string;
  steps: SupervisionPlanStep[];
  unit: string;
  updatedAt?: string;
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
  manpower: number;
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
}

export interface SupervisionReportTaskUpdate {
  completedQuantity?: number;
  createdAt?: string;
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

export interface SupervisionDashboard {
  activeProjectCount: number;
  averageProgress: number;
  delayedMilestoneCount: number;
  highRiskProjectCount: number;
  openIssueCount: number;
  overdueIssueCount: number;
  reportsTodayCount: number;
  supplierStats: Array<{
    openIssueCount: number;
    projectCount: number;
    supplierName: string;
  }>;
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
