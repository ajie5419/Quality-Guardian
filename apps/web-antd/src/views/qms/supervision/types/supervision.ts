import type {
  SupervisionIssue,
  SupervisionPlanTask,
  SupervisionProject,
} from '@qgs/shared';
import type { UploadFile } from 'ant-design-vue';
import type dayjs from 'dayjs';

export type ProjectFormState = {
  actualEndAt?: dayjs.Dayjs;
  actualStartAt?: dayjs.Dayjs;
  location: string;
  milestonesText: string;
  participantsText: string;
  plannedEndAt?: dayjs.Dayjs;
  plannedStartAt?: dayjs.Dayjs;
  progressPercent: number;
  projectName: string;
  projectType: SupervisionProject['projectType'];
  riskLevel: string;
  stage: string;
  status: SupervisionProject['status'];
  summary: string;
  supervisor: string;
  supplierName: string;
  workOrderNumber: string;
};

export type ReportFormState = {
  attachments: UploadFile[];
  completedMilestone: string;
  coordinationNeeded: string;
  issueSummary: string;
  location: string;
  manpower: number;
  progressPercent: number;
  projectId: string;
  reportDate: dayjs.Dayjs;
  reporter: string;
  taskId: string;
  taskNextPlan: string;
  taskProgressPercent: number;
  taskRiskReason: string;
  taskStatus: string;
  taskWorkContent: string;
  tomorrowPlan: string;
  weather: string;
  workContent: string;
};

export type ReportTaskDraft = {
  completedQuantity: number;
  dailyQuantity: number;
  enabled: boolean;
  nextPlan: string;
  photos: UploadFile[];
  plannedQuantity: number;
  progressPercent: number;
  quantityUnit: string;
  riskReason: string;
  status: SupervisionPlanTask['status'];
  task: SupervisionPlanTask;
  workContent: string;
};

export type IssueFormState = {
  affectsProgress: boolean;
  correctiveAction: string;
  description: string;
  dueAt?: dayjs.Dayjs;
  estimatedLoss: number;
  isClaim: boolean;
  issueType: string;
  photos: UploadFile[];
  projectId: string;
  rectificationPhotos: UploadFile[];
  responsibleUnit: string;
  severity: string;
  status: SupervisionIssue['status'];
  verifyResult: string;
};

export type PlanStepFormState = {
  actualAt?: dayjs.Dayjs;
  plannedAt?: dayjs.Dayjs;
  remark: string;
  sortOrder: number;
  status: string;
  stepName: string;
};
