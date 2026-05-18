import type {
  SupervisionDailyReport,
  SupervisionReportParams,
  SupervisionReportTaskUpdate,
} from '@qgs/shared';

import { formatDate } from '@qgs/shared';

import {
  calculatePlanTaskStatus,
  calculateQuantityProgress,
  mapPlanTask,
  normalizeDate,
  normalizePercent,
  normalizePositiveQuantity,
  normalizeQuantity,
  normalizeText,
  parseList,
  prisma,
  stringifyList,
  summarizePlanTasks,
} from './supervision-shared';

function mapReport(row: any) {
  return {
    attachments: parseList(row.attachments),
    completedMilestone: row.completedMilestone || '',
    coordinationNeeded: row.coordinationNeeded || '',
    createdAt: row.createdAt?.toISOString(),
    id: row.id,
    issueSummary: row.issueSummary || '',
    location: row.location || '',
    manpower: row.manpower || 0,
    progressPercent: row.progressPercent || 0,
    projectId: row.projectId,
    projectName: row.project?.projectName || '',
    reportDate: formatDate(row.reportDate),
    reporter: row.reporter,
    taskUpdates: (row.taskUpdates || []).map((item: any) =>
      mapReportTaskUpdate(item),
    ),
    tomorrowPlan: row.tomorrowPlan || '',
    updatedAt: row.updatedAt?.toISOString(),
    weather: row.weather || '',
    workContent: row.workContent || '',
  } satisfies SupervisionDailyReport;
}

function mapReportTaskUpdate(row: any) {
  return {
    completedQuantity: normalizeQuantity(row.completedQuantity, 0),
    createdAt: row.createdAt?.toISOString(),
    dailyQuantity: normalizeQuantity(row.dailyQuantity, 0),
    id: row.id,
    nextPlan: row.nextPlan || '',
    photos: parseList(row.photos),
    plannedQuantity: normalizePositiveQuantity(row.plannedQuantity, 1),
    progressPercent: row.progressPercent || 0,
    projectId: row.projectId,
    quantityUnit: row.quantityUnit || '项',
    reportId: row.reportId,
    riskReason: row.riskReason || '',
    status: row.status || 'IN_PROGRESS',
    taskId: row.taskId,
    taskName: row.taskName || '',
    taskNo: row.taskNo || '',
    workContent: row.workContent || '',
  } satisfies SupervisionReportTaskUpdate;
}

export const SupervisionReportService = {
  async createReport(payload: Record<string, unknown>) {
    const progressPercent = normalizePercent(payload.progressPercent);
    const projectId = normalizeText(payload.projectId);
    const taskUpdates = Array.isArray(payload.taskUpdates)
      ? (payload.taskUpdates as Array<Record<string, unknown>>)
      : [];
    const reportDate = normalizeDate(payload.reportDate) || new Date();
    const row = await prisma.$transaction(async (tx) => {
      const report = await tx.supervision_daily_reports.create({
        data: {
          attachments: stringifyList(payload.attachments),
          completedMilestone: normalizeText(payload.completedMilestone) || null,
          coordinationNeeded: normalizeText(payload.coordinationNeeded) || null,
          issueSummary: normalizeText(payload.issueSummary) || null,
          location: normalizeText(payload.location) || null,
          manpower: Math.max(0, Math.trunc(Number(payload.manpower || 0))),
          progressPercent,
          projectId,
          reportDate,
          reporter: normalizeText(payload.reporter),
          tomorrowPlan: normalizeText(payload.tomorrowPlan) || null,
          weather: normalizeText(payload.weather) || null,
          workContent: normalizeText(payload.workContent) || null,
        },
      });

      for (const item of taskUpdates) {
        const taskId = normalizeText(item.taskId);
        if (!taskId) continue;
        const task = await tx.supervision_plan_tasks.findFirst({
          where: { id: taskId, isDeleted: false, projectId },
        });
        if (!task) continue;
        const plannedQuantity = normalizePositiveQuantity(
          item.plannedQuantity,
          normalizePositiveQuantity(task.plannedQuantity, 1),
        );
        const currentCompletedQuantity = normalizeQuantity(
          task.completedQuantity,
          0,
        );
        const dailyQuantity = normalizeQuantity(item.dailyQuantity, 0);
        const submittedCompletedQuantity =
          item.completedQuantity === undefined
            ? undefined
            : normalizeQuantity(
                item.completedQuantity,
                currentCompletedQuantity,
              );
        const rawCompletedQuantity = Math.min(
          plannedQuantity,
          Math.max(
            currentCompletedQuantity,
            submittedCompletedQuantity ??
              currentCompletedQuantity + dailyQuantity,
          ),
        );
        const updateStatus =
          normalizeText(item.status).toUpperCase() || 'IN_PROGRESS';
        const nextCompletedQuantity =
          updateStatus === 'DONE' ? plannedQuantity : rawCompletedQuantity;
        const nextProgress = calculateQuantityProgress(
          nextCompletedQuantity,
          plannedQuantity,
        );
        const isDone = nextProgress >= 100 || updateStatus === 'DONE';
        const riskReason = normalizeText(item.riskReason);
        await tx.supervision_report_task_updates.create({
          data: {
            completedQuantity: nextCompletedQuantity,
            dailyQuantity,
            nextPlan: normalizeText(item.nextPlan) || null,
            photos: stringifyList(item.photos),
            plannedQuantity,
            progressPercent: nextProgress,
            projectId,
            quantityUnit:
              normalizeText(item.quantityUnit || task.quantityUnit) || '项',
            reportId: report.id,
            riskReason: riskReason || null,
            status: updateStatus,
            taskId,
            taskName: task.taskName,
            taskNo: task.taskNo,
            workContent: normalizeText(item.workContent) || null,
          },
        });
        let actualStartAt: Date | undefined;
        if (!task.actualStartAt && nextProgress > 0) {
          actualStartAt = reportDate;
        }
        const actualEndAt = isDone ? reportDate : undefined;
        const riskLevel = updateStatus === 'RISK' ? 'RISK' : 'NORMAL';
        await tx.supervision_plan_tasks.update({
          data: {
            actualEndAt,
            actualStartAt,
            completedQuantity: nextCompletedQuantity,
            lastReportAt: reportDate,
            lastReportId: report.id,
            plannedQuantity,
            progressPercent: nextProgress,
            riskLevel,
            riskReason: riskReason || null,
            status: calculatePlanTaskStatus({
              actualEndAt,
              actualStartAt: task.actualStartAt || actualStartAt,
              plannedEndAt: task.plannedEndAt,
              plannedStartAt: task.plannedStartAt,
              progressPercent: nextProgress,
              riskLevel,
            }),
          },
          where: { id: taskId },
        });
      }

      const projectTasks = await tx.supervision_plan_tasks.findMany({
        where: { isDeleted: false, projectId },
      });
      const projectProgress = summarizePlanTasks(
        projectTasks.map((item) => mapPlanTask(item)),
      ).progressPercent;

      await tx.supervision_projects.update({
        data: {
          location: normalizeText(payload.location) || undefined,
          progressPercent: projectProgress,
          stage: normalizeText(payload.completedMilestone) || undefined,
          status: projectProgress >= 100 ? 'COMPLETED' : 'IN_PROGRESS',
        },
        where: { id: projectId },
      });

      return tx.supervision_daily_reports.findUniqueOrThrow({
        include: {
          project: { select: { projectName: true } },
          taskUpdates: true,
        },
        where: { id: report.id },
      });
    });
    return mapReport(row);
  },

  async listReports(params: SupervisionReportParams) {
    const page = Math.max(1, Number(params.page || 1));
    const pageSize = Math.max(1, Number(params.pageSize || 20));
    const where: any = { isDeleted: false };
    if (params.projectId) where.projectId = params.projectId;
    const [items, total] = await Promise.all([
      prisma.supervision_daily_reports.findMany({
        include: {
          project: { select: { projectName: true } },
          taskUpdates: true,
        },
        orderBy: { reportDate: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        where,
      }),
      prisma.supervision_daily_reports.count({ where }),
    ]);
    return { items: items.map((item) => mapReport(item)), total };
  },

  async updateReport(id: string, payload: Record<string, unknown>) {
    const data: any = {};
    if (payload.workContent !== undefined)
      data.workContent = normalizeText(payload.workContent) || null;
    if (payload.reporter !== undefined)
      data.reporter = normalizeText(payload.reporter);
    if (payload.reportDate !== undefined)
      data.reportDate = normalizeDate(payload.reportDate);

    const row = await prisma.supervision_daily_reports.update({
      data,
      include: {
        project: { select: { projectName: true } },
        taskUpdates: true,
      },
      where: { id },
    });
    return mapReport(row);
  },

  async deleteReport(id: string) {
    await prisma.supervision_daily_reports.update({
      data: { isDeleted: true },
      where: { id },
    });
  },
};
