import type {
  DeadlineBoardResult,
  SupervisionDailyReport,
  SupervisionIssue,
  SupervisionIssueAction,
  SupervisionIssueParams,
  SupervisionPlanTaskImportResult,
  SupervisionProject,
  SupervisionProjectParams,
  SupervisionReportParams,
} from '@qgs/shared';

import { normalizeListResponse } from '#/api/qms/adapters';
import { requestClient } from '#/api/request';

import { QMS_API } from './constants';

export async function getSupervisionDeadlineBoard(params?: {
  dueSoonDays?: number;
  projectId?: string;
}) {
  return requestClient.get<DeadlineBoardResult>(
    QMS_API.SUPERVISION_DEADLINE_BOARD,
    { params },
  );
}

export async function getSupervisionProjects(
  params?: SupervisionProjectParams,
) {
  const raw = await requestClient.get<{
    items: SupervisionProject[];
    total: number;
  }>(QMS_API.SUPERVISION_PROJECTS, { params });
  return normalizeListResponse<SupervisionProject>(raw);
}

export async function createSupervisionProject(
  data: Partial<SupervisionProject>,
) {
  return requestClient.post<SupervisionProject>(
    QMS_API.SUPERVISION_PROJECTS,
    data,
  );
}

export async function updateSupervisionProject(
  id: string,
  data: Partial<SupervisionProject>,
) {
  return requestClient.put<SupervisionProject>(
    `${QMS_API.SUPERVISION_PROJECTS}/${id}`,
    data,
  );
}

export async function deleteSupervisionProject(id: string) {
  return requestClient.delete(`${QMS_API.SUPERVISION_PROJECTS}/${id}`, {
    params: { id },
  });
}

export async function getSupervisionPlanTasks(projectId: string) {
  return requestClient.get<SupervisionPlanTaskImportResult>(
    `${QMS_API.SUPERVISION_PROJECTS}/${projectId}/plan-tasks`,
  );
}

export async function importSupervisionPlanTasks(
  projectId: string,
  data: { fileName?: string; fileUrl: string; storedName?: string },
) {
  return requestClient.post<SupervisionPlanTaskImportResult>(
    `${QMS_API.SUPERVISION_PROJECTS}/${projectId}/plan-tasks/import`,
    data,
  );
}

export async function getSupervisionReports(params?: SupervisionReportParams) {
  const raw = await requestClient.get<{
    items: SupervisionDailyReport[];
    total: number;
  }>(QMS_API.SUPERVISION_REPORTS, { params });
  return normalizeListResponse<SupervisionDailyReport>(raw);
}

export async function createSupervisionReport(
  data: Partial<SupervisionDailyReport>,
) {
  return requestClient.post<SupervisionDailyReport>(
    QMS_API.SUPERVISION_REPORTS,
    data,
  );
}

export async function updateSupervisionReport(
  id: string,
  data: Partial<SupervisionDailyReport>,
) {
  return requestClient.put<SupervisionDailyReport>(
    QMS_API.SUPERVISION_REPORTS,
    data,
    { params: { id } },
  );
}

export async function deleteSupervisionReport(id: string) {
  return requestClient.delete(QMS_API.SUPERVISION_REPORTS, {
    params: { id },
  });
}

export async function getSupervisionIssues(params?: SupervisionIssueParams) {
  const raw = await requestClient.get<{
    items: SupervisionIssue[];
    total: number;
  }>(QMS_API.SUPERVISION_ISSUES, { params });
  return normalizeListResponse<SupervisionIssue>(raw);
}

export async function createSupervisionIssue(data: Partial<SupervisionIssue>) {
  return requestClient.post<SupervisionIssue>(QMS_API.SUPERVISION_ISSUES, data);
}

export async function updateSupervisionIssue(
  id: string,
  data: Partial<SupervisionIssue>,
) {
  return requestClient.put<SupervisionIssue>(
    `${QMS_API.SUPERVISION_ISSUES}/${id}`,
    data,
  );
}

export async function deleteSupervisionIssue(id: string) {
  return requestClient.delete(`${QMS_API.SUPERVISION_ISSUES}/${id}`, {
    params: { id },
  });
}

export async function getSupervisionIssueActions(issueId: string) {
  return requestClient.get<SupervisionIssueAction[]>(
    `${QMS_API.SUPERVISION_ISSUES}/${issueId}/actions`,
  );
}

export async function createSupervisionIssueAction(
  issueId: string,
  data: Partial<SupervisionIssueAction> & {
    rectificationPhotos?: string[];
    status?: SupervisionIssue['status'];
    verifyResult?: string;
  },
) {
  return requestClient.post<SupervisionIssueAction>(
    `${QMS_API.SUPERVISION_ISSUES}/${issueId}/actions`,
    data,
  );
}

export async function createSupervisionPlanTask(
  projectId: string,
  data: {
    durationDays?: number;
    parentId?: string;
    plannedEndAt?: string;
    plannedQuantity?: number;
    plannedStartAt?: string;
    predecessorText?: string;
    quantityUnit?: string;
    resourceName?: string;
    taskName: string;
    taskNo: string;
    weight?: number;
  },
) {
  return requestClient.post<SupervisionPlanTaskImportResult>(
    `${QMS_API.SUPERVISION_PROJECTS}/${projectId}/plan-tasks`,
    data,
  );
}

export async function updateSupervisionPlanTask(
  projectId: string,
  taskId: string,
  data: Record<string, unknown>,
) {
  return requestClient.put<SupervisionPlanTaskImportResult>(
    `${QMS_API.SUPERVISION_PROJECTS}/${projectId}/plan-tasks/${taskId}`,
    data,
  );
}

export async function deleteSupervisionPlanTask(
  projectId: string,
  taskId: string,
) {
  return requestClient.delete<SupervisionPlanTaskImportResult>(
    `${QMS_API.SUPERVISION_PROJECTS}/${projectId}/plan-tasks/${taskId}`,
  );
}

export async function reorderSupervisionPlanTasks(
  projectId: string,
  items: Array<{
    id: string;
    outlineLevel?: number;
    parentId?: null | string;
    sortOrder: number;
  }>,
) {
  return requestClient.put<SupervisionPlanTaskImportResult>(
    `${QMS_API.SUPERVISION_PROJECTS}/${projectId}/plan-tasks/reorder`,
    { items },
  );
}
