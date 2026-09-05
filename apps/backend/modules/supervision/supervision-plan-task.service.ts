import type {
  DeadlineBoardResult,
  SupervisionPlanTaskImportResult,
} from '@qgs/shared';

import type { SupervisionAccessContext } from './supervision-access';

import { BusinessError } from '~/utils/business-error';

import { buildSupervisionAccessWhere } from './supervision-access';
import { auditSupervisionWrite } from './supervision-audit';
import { SupervisionDeadlineBoardService } from './supervision-deadline-board.service';
import { SupervisionPlanTaskImportService } from './supervision-plan-task-import.service';
import { syncSupervisionProjectProgress } from './supervision-plan-task-progress';
import {
  buildPlanTaskTree,
  calculatePlanTaskStatus,
  mapPlanTask,
  normalizeDate,
  normalizePercent,
  normalizePositiveQuantity,
  normalizeText,
  prisma,
  rollupSummaryTasks,
  summarizePlanTasks,
} from './supervision-shared';
import { throwSupervisionConflict } from './supervision-state';

export const SupervisionPlanTaskService = {
  async deadlineBoard(params?: {
    dueSoonDays?: number;
    projectId?: string;
  }): Promise<DeadlineBoardResult> {
    return SupervisionDeadlineBoardService.deadlineBoard(params);
  },

  async listPlanTasks(
    projectId: string,
  ): Promise<SupervisionPlanTaskImportResult> {
    const rows = await prisma.supervision_plan_tasks.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      where: { isDeleted: false, projectId },
    });
    const items = rows.map((row) => mapPlanTask(row));
    rollupSummaryTasks(items);
    return {
      items,
      summary: summarizePlanTasks(items.filter((task) => !task.isSummary)),
      tree: buildPlanTaskTree(items),
    };
  },

  async importPlanTasks(
    projectId: string,
    payload: Record<string, unknown>,
    context: SupervisionAccessContext,
  ): Promise<SupervisionPlanTaskImportResult> {
    return SupervisionPlanTaskImportService.importPlanTasks(
      projectId,
      payload,
      this.listPlanTasks.bind(this),
      context,
    );
  },

  async createTask(
    projectId: string,
    payload: {
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
    context: SupervisionAccessContext,
  ): Promise<SupervisionPlanTaskImportResult> {
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
    const parentId = payload.parentId || null;
    let outlineLevel = 1;
    if (parentId) {
      const parent = await prisma.supervision_plan_tasks.findFirst({
        where: { id: parentId, isDeleted: false, projectId },
      });
      if (parent) {
        outlineLevel = (parent.outlineLevel || 1) + 1;
        if (!parent.isSummary) {
          await prisma.supervision_plan_tasks.update({
            data: { isSummary: true },
            where: {
              id: parentId,
              projectId,
              ...buildSupervisionAccessWhere('task', context),
            },
          });
        }
      }
    }
    const maxSort = await prisma.supervision_plan_tasks.aggregate({
      _max: { sortOrder: true },
      where: { isDeleted: false, projectId },
    });
    const plannedStartAt = payload.plannedStartAt
      ? normalizeDate(payload.plannedStartAt)
      : undefined;
    const plannedEndAt = payload.plannedEndAt
      ? normalizeDate(payload.plannedEndAt)
      : undefined;
    const created = await prisma.supervision_plan_tasks.create({
      data: {
        durationDays: payload.durationDays ?? null,
        isSummary: false,
        outlineLevel,
        outlineNumber: payload.taskNo,
        parentId,
        plannedEndAt,
        plannedQuantity: payload.plannedQuantity ?? 1,
        plannedStartAt,
        predecessorText: payload.predecessorText || null,
        projectId,
        quantityUnit: payload.quantityUnit || '项',
        resourceName: payload.resourceName || null,
        sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
        status: calculatePlanTaskStatus({ plannedEndAt, plannedStartAt }),
        taskName: payload.taskName,
        taskNo: payload.taskNo,
        weight: payload.weight ?? 1,
      },
    });
    await auditSupervisionWrite({
      action: 'task-create',
      context,
      detailsVariables: { taskNo: String(payload.taskNo ?? '') },
      targetId: created.id,
    });
    await syncSupervisionProjectProgress(projectId);
    return this.listPlanTasks(projectId);
  },

  async updateTask(
    projectId: string,
    taskId: string,
    payload: Record<string, unknown>,
    context: SupervisionAccessContext,
  ): Promise<SupervisionPlanTaskImportResult> {
    const accessWhere = buildSupervisionAccessWhere('task', context);
    const current = await prisma.supervision_plan_tasks.findFirst({
      select: {
        actualEndAt: true,
        actualStartAt: true,
        id: true,
        plannedEndAt: true,
        plannedStartAt: true,
        progressPercent: true,
        riskLevel: true,
        status: true,
      },
      where: {
        id: taskId,
        isDeleted: false,
        projectId,
        ...accessWhere,
      },
    });
    if (!current) {
      throw new BusinessError('NOT_FOUND', '监造任务不存在', 404);
    }
    const data: any = {};
    if (payload.taskName !== undefined)
      data.taskName = normalizeText(payload.taskName);
    if (payload.taskNo !== undefined)
      data.taskNo = normalizeText(payload.taskNo);
    if (payload.plannedStartAt !== undefined)
      data.plannedStartAt = normalizeDate(payload.plannedStartAt) || null;
    if (payload.plannedEndAt !== undefined)
      data.plannedEndAt = normalizeDate(payload.plannedEndAt) || null;
    if (payload.actualStartAt !== undefined)
      data.actualStartAt = normalizeDate(payload.actualStartAt) || null;
    if (payload.actualEndAt !== undefined)
      data.actualEndAt = normalizeDate(payload.actualEndAt) || null;
    if (payload.plannedQuantity !== undefined)
      data.plannedQuantity = normalizePositiveQuantity(
        payload.plannedQuantity,
        1,
      );
    if (payload.progressPercent !== undefined)
      data.progressPercent = normalizePercent(payload.progressPercent);
    if (payload.weight !== undefined)
      data.weight = normalizePositiveQuantity(payload.weight, 1);
    if (payload.quantityUnit !== undefined)
      data.quantityUnit = normalizeText(payload.quantityUnit) || '项';
    if (payload.resourceName !== undefined)
      data.resourceName = normalizeText(payload.resourceName) || null;
    if (payload.predecessorText !== undefined)
      data.predecessorText = normalizeText(payload.predecessorText) || null;
    if (payload.durationDays !== undefined)
      data.durationDays =
        payload.durationDays === null ? null : Number(payload.durationDays);
    if (payload.riskLevel !== undefined)
      data.riskLevel =
        normalizeText(payload.riskLevel).toUpperCase() || 'NORMAL';
    if (payload.riskReason !== undefined)
      data.riskReason = normalizeText(payload.riskReason) || null;
    if (payload.parentId !== undefined) {
      const newParentId = payload.parentId ? String(payload.parentId) : null;
      data.parentId = newParentId;
      if (newParentId) {
        const parent = await prisma.supervision_plan_tasks.findFirst({
          where: { id: newParentId, isDeleted: false, projectId },
        });
        data.outlineLevel = parent ? (parent.outlineLevel || 1) + 1 : 1;
        if (parent && !parent.isSummary) {
          await prisma.supervision_plan_tasks.update({
            data: { isSummary: true },
            where: {
              id: newParentId,
              projectId,
              ...buildSupervisionAccessWhere('task', context),
            },
          });
        }
      } else {
        data.outlineLevel = 1;
      }
    }

    const nextProgress =
      payload.progressPercent === undefined
        ? current.progressPercent
        : normalizePercent(payload.progressPercent);
    if (payload.progressPercent !== undefined) {
      // Task status is derived; recalc it so progress and status cannot drift.
      data.status = calculatePlanTaskStatus({
        actualEndAt:
          payload.actualEndAt === undefined
            ? current.actualEndAt
            : normalizeDate(payload.actualEndAt) || null,
        actualStartAt:
          payload.actualStartAt === undefined
            ? current.actualStartAt
            : normalizeDate(payload.actualStartAt) || null,
        plannedEndAt:
          payload.plannedEndAt === undefined
            ? current.plannedEndAt
            : normalizeDate(payload.plannedEndAt) || null,
        plannedStartAt:
          payload.plannedStartAt === undefined
            ? current.plannedStartAt
            : normalizeDate(payload.plannedStartAt) || null,
        progressPercent: nextProgress,
        riskLevel: current.riskLevel,
      });
    }
    const result = await prisma.supervision_plan_tasks.updateMany({
      data,
      where: {
        id: taskId,
        isDeleted: false,
        projectId,
        status: current.status,
        ...accessWhere,
      },
    });
    if (result.count !== 1) {
      throwSupervisionConflict('监造任务状态已变化，请刷新后重试');
    }
    await auditSupervisionWrite({
      action: 'task-update',
      context,
      detailsVariables: {
        progressPercent: String(nextProgress ?? ''),
        taskNo: String(payload.taskNo ?? ''),
      },
      targetId: taskId,
    });
    await syncSupervisionProjectProgress(projectId);
    return this.listPlanTasks(projectId);
  },

  async deleteTask(
    projectId: string,
    taskId: string,
    context: SupervisionAccessContext,
  ): Promise<SupervisionPlanTaskImportResult> {
    await prisma.$transaction(async (tx) => {
      const accessWhere = buildSupervisionAccessWhere('task', context);
      const task = await tx.supervision_plan_tasks.findFirst({
        select: { id: true, outlineLevel: true, parentId: true, status: true },
        where: { id: taskId, isDeleted: false, projectId, ...accessWhere },
      });
      if (!task) throw new BusinessError('NOT_FOUND', '监造任务不存在', 404);
      if (task.status === 'DONE') {
        throwSupervisionConflict('已完成监造任务不可删除');
      }
      await tx.supervision_plan_tasks.updateMany({
        data: { outlineLevel: task.outlineLevel, parentId: task.parentId },
        where: {
          isDeleted: false,
          parentId: taskId,
          projectId,
          ...accessWhere,
        },
      });
      const deleted = await tx.supervision_plan_tasks.updateMany({
        data: { isDeleted: true },
        where: { id: taskId, isDeleted: false, projectId, ...accessWhere },
      });
      if (deleted.count !== 1) {
        throwSupervisionConflict('监造任务状态已变化，请刷新后重试');
      }
      if (task.parentId) {
        const siblingCount = await tx.supervision_plan_tasks.count({
          where: {
            isDeleted: false,
            parentId: task.parentId,
            projectId,
            ...accessWhere,
          },
        });
        if (siblingCount === 0) {
          await tx.supervision_plan_tasks.update({
            data: { isSummary: false },
            where: {
              id: task.parentId,
              projectId,
              ...accessWhere,
            },
          });
        }
      }
    });
    await auditSupervisionWrite({
      action: 'task-delete',
      context,
      detailsVariables: { taskNo: '' },
      targetId: taskId,
    });
    await syncSupervisionProjectProgress(projectId);
    return this.listPlanTasks(projectId);
  },

  async reorderTasks(
    projectId: string,
    items: Array<{
      id: string;
      outlineLevel?: number;
      parentId?: null | string;
      sortOrder: number;
    }>,
    context: SupervisionAccessContext,
  ): Promise<SupervisionPlanTaskImportResult> {
    await prisma.$transaction(async (tx) => {
      const accessWhere = buildSupervisionAccessWhere('task', context);
      for (const item of items) {
        const data: any = { sortOrder: item.sortOrder };
        if (item.parentId !== undefined) data.parentId = item.parentId || null;
        if (item.outlineLevel !== undefined)
          data.outlineLevel = item.outlineLevel;
        await tx.supervision_plan_tasks.update({
          data,
          where: { id: item.id, projectId, ...accessWhere },
        });
      }
      const allTasks = await tx.supervision_plan_tasks.findMany({
        select: { id: true, parentId: true },
        where: { isDeleted: false, projectId, ...accessWhere },
      });
      const parentIds = new Set(
        allTasks.map((t) => t.parentId).filter(Boolean) as string[],
      );
      for (const task of allTasks) {
        const shouldBeSummary = parentIds.has(task.id);
        await tx.supervision_plan_tasks.update({
          data: { isSummary: shouldBeSummary },
          where: { id: task.id, projectId, ...accessWhere },
        });
      }
    });
    await syncSupervisionProjectProgress(projectId);
    return this.listPlanTasks(projectId);
  },
};
