import type {
  SupervisionDailyReport,
  SupervisionReportParams,
  SupervisionReportTaskUpdate,
} from '@qgs/shared';

import type { SupervisionAccessContext } from './supervision-access';

import { formatDate } from '@qgs/shared';
import { BusinessError } from '~/utils/business-error';

import { buildSupervisionAccessWhere } from './supervision-access';
import { auditSupervisionWrite } from './supervision-audit';
import { syncSupervisionProjectProgress } from './supervision-plan-task-progress';
import {
  calculatePlanTaskStatus,
  calculateQuantityProgress,
  normalizeDate,
  normalizePercent,
  normalizePositiveQuantity,
  normalizeQuantity,
  normalizeText,
  parseList,
  prisma,
  stringifyList,
} from './supervision-shared';
import { throwSupervisionConflict } from './supervision-state';

/**
 * Summarize a task field (workContent or nextPlan) into a multi-line string.
 * Each line is formatted as "{taskName}：{value}".
 * Tasks with an empty value for the given field are skipped.
 */
function summarizeTaskField(
  taskUpdates: Array<Record<string, unknown>>,
  field: 'nextPlan' | 'workContent',
): string {
  return taskUpdates
    .map((item) => {
      const value = normalizeText(item[field]);
      if (!value) return '';
      const taskName =
        normalizeText(item.taskName) || normalizeText(item.taskNo) || '';
      return taskName ? `${taskName}：${value}` : value;
    })
    .filter(Boolean)
    .join('\n');
}

function mapReport(row: any) {
  return {
    attachments: parseList(row.attachments),
    completedMilestone: row.completedMilestone || '',
    coordinationNeeded: row.coordinationNeeded || '',
    createdAt: row.createdAt?.toISOString(),
    id: row.id,
    issueSummary: row.issueSummary || '',
    location: row.location || '',
    manpower: row.manpower || '',
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
    workOrderNumber: row.project?.workOrderNumber || '',
  } satisfies SupervisionDailyReport;
}

function mapReportTaskUpdate(row: any) {
  const computedStatus = row.task
    ? calculatePlanTaskStatus({
        actualEndAt: row.task.actualEndAt ?? null,
        actualStartAt: row.task.actualStartAt ?? null,
        plannedEndAt: row.task.plannedEndAt ?? null,
        plannedStartAt: row.task.plannedStartAt ?? null,
        progressPercent: row.task.progressPercent ?? 0,
        riskLevel: row.task.riskLevel ?? null,
      })
    : null;
  return {
    completedQuantity: normalizeQuantity(row.completedQuantity, 0),
    createdAt: row.createdAt?.toISOString(),
    // currentTaskStatus: real-time status computed from the linked plan task's
    // current fields, not from the stale status column. Falls back to the
    // snapshot status on this record when the task has been deleted.
    currentTaskStatus: computedStatus ?? row.status ?? 'IN_PROGRESS',
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
  async createReport(
    payload: Record<string, unknown>,
    context: SupervisionAccessContext,
  ) {
    const progressPercent = normalizePercent(payload.progressPercent);
    const projectId = normalizeText(payload.projectId);
    const project = await prisma.supervision_projects.findFirst({
      select: { id: true },
      where: {
        id: projectId,
        isDeleted: false,
        ...buildSupervisionAccessWhere('project', context),
      },
    });
    if (!project) {
      throw new BusinessError('NOT_FOUND', '监造项目不存在', 404);
    }
    // Reporter and creator always derive from the authenticated user; the
    // client-supplied reporter field can no longer impersonate someone else.
    const reporter = String(
      context.user.realName || context.user.username || '',
    ).trim();
    if (!reporter) {
      throw new BusinessError('FORBIDDEN', '缺少监造人员身份', 403);
    }
    const taskUpdates = Array.isArray(payload.taskUpdates)
      ? (payload.taskUpdates as Array<Record<string, unknown>>)
      : [];
    const reportDate = normalizeDate(payload.reportDate) || new Date();

    // Auto-summarize completedMilestone and tomorrowPlan from task updates
    const completedMilestone = summarizeTaskField(taskUpdates, 'workContent');
    const tomorrowPlan = summarizeTaskField(taskUpdates, 'nextPlan');

    const row = await prisma.$transaction(async (tx) => {
      const report = await tx.supervision_daily_reports.create({
        data: {
          attachments: stringifyList(payload.attachments),
          completedMilestone: completedMilestone || null,
          coordinationNeeded: normalizeText(payload.coordinationNeeded) || null,
          createdBy: context.userId || null,
          issueSummary: normalizeText(payload.issueSummary) || null,
          location: normalizeText(payload.location) || null,
          manpower: normalizeText(payload.manpower) || null,
          progressPercent,
          projectId,
          reportDate,
          reporter,
          tomorrowPlan: tomorrowPlan || null,
          weather: normalizeText(payload.weather) || null,
          workContent: normalizeText(payload.workContent) || null,
        },
      });

      for (const item of taskUpdates) {
        const taskId = normalizeText(item.taskId);
        if (!taskId) continue;
        const task = await tx.supervision_plan_tasks.findFirst({
          where: {
            id: taskId,
            isDeleted: false,
            projectId,
            ...buildSupervisionAccessWhere('task', context),
          },
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
        const taskUpdate = await tx.supervision_plan_tasks.updateMany({
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
          where: {
            id: taskId,
            projectId,
            status: task.status,
            ...buildSupervisionAccessWhere('task', context),
          },
        });
        if (taskUpdate.count !== 1) {
          throwSupervisionConflict('监造任务状态已变化，请刷新后重试');
        }
      }

      // Sync project progressPercent and status from leaf tasks (isSummary: false).
      // Uses the shared helper so both code paths stay consistent.
      await syncSupervisionProjectProgress(projectId, tx);
      // Update location/stage from the report payload separately.
      const projectUpdate = await tx.supervision_projects.updateMany({
        data: {
          location: normalizeText(payload.location) || undefined,
          stage: normalizeText(payload.completedMilestone) || undefined,
        },
        where: {
          id: projectId,
          isDeleted: false,
          ...buildSupervisionAccessWhere('project', context),
        },
      });
      if (projectUpdate.count !== 1) {
        throwSupervisionConflict('监造项目状态已变化，请刷新后重试');
      }

      return tx.supervision_daily_reports.findUniqueOrThrow({
        include: {
          project: { select: { projectName: true, workOrderNumber: true } },
          taskUpdates: {
            include: {
              task: {
                select: {
                  actualEndAt: true,
                  actualStartAt: true,
                  plannedEndAt: true,
                  plannedStartAt: true,
                  progressPercent: true,
                  riskLevel: true,
                },
              },
            },
          },
        },
        where: { id: report.id },
      });
    });
    await auditSupervisionWrite({
      action: 'report-create',
      context,
      detailsVariables: {
        reportDate: String(payload.reportDate ?? reportDate.toISOString()),
      },
      targetId: row.id,
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
          project: { select: { projectName: true, workOrderNumber: true } },
          taskUpdates: {
            include: {
              task: {
                select: {
                  actualEndAt: true,
                  actualStartAt: true,
                  plannedEndAt: true,
                  plannedStartAt: true,
                  progressPercent: true,
                  riskLevel: true,
                },
              },
            },
          },
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

  async updateReport(
    id: string,
    payload: Record<string, unknown>,
    context: SupervisionAccessContext,
  ) {
    const data: any = {};
    if (payload.workContent !== undefined)
      data.workContent = normalizeText(payload.workContent) || null;
    if (payload.reportDate !== undefined)
      data.reportDate = normalizeDate(payload.reportDate);
    if (payload.location !== undefined)
      data.location = normalizeText(payload.location) || null;
    if (payload.weather !== undefined)
      data.weather = normalizeText(payload.weather) || null;
    if (payload.manpower !== undefined)
      data.manpower = normalizeText(payload.manpower) || null;
    if (payload.issueSummary !== undefined)
      data.issueSummary = normalizeText(payload.issueSummary) || null;
    if (payload.coordinationNeeded !== undefined)
      data.coordinationNeeded =
        normalizeText(payload.coordinationNeeded) || null;
    if (payload.attachments !== undefined)
      data.attachments = stringifyList(payload.attachments);
    if (payload.progressPercent !== undefined)
      data.progressPercent = normalizePercent(payload.progressPercent);

    const accessWhere = buildSupervisionAccessWhere('report', context);
    const result = await prisma.supervision_daily_reports.updateMany({
      data,
      where: { id, isDeleted: false, ...accessWhere },
    });
    if (result.count !== 1) {
      throwSupervisionConflict('监造日报不存在或无权修改');
    }
    const row = await prisma.supervision_daily_reports.findFirst({
      include: {
        project: { select: { projectName: true, workOrderNumber: true } },
        taskUpdates: {
          include: {
            task: {
              select: {
                actualEndAt: true,
                actualStartAt: true,
                plannedEndAt: true,
                plannedStartAt: true,
                progressPercent: true,
                riskLevel: true,
              },
            },
          },
        },
      },
      where: { id, isDeleted: false, ...accessWhere },
    });
    if (!row) {
      throw new BusinessError('NOT_FOUND', '监造日报不存在', 404);
    }
    await auditSupervisionWrite({
      action: 'report-update',
      context,
      detailsVariables: { id },
      targetId: id,
    });
    return mapReport(row);
  },

  async deleteReport(id: string, context: SupervisionAccessContext) {
    const accessWhere = buildSupervisionAccessWhere('report', context);
    const result = await prisma.supervision_daily_reports.updateMany({
      data: { isDeleted: true },
      where: { id, isDeleted: false, ...accessWhere },
    });
    if (result.count !== 1) {
      throwSupervisionConflict('监造日报不存在或无权删除');
    }
    await auditSupervisionWrite({
      action: 'report-delete',
      context,
      detailsVariables: { id },
      targetId: id,
    });
  },
};
