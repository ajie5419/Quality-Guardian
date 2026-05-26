import type {
  DeadlineBoardResult,
  DeadlineBoardTask,
  SupervisionPlanTaskImportResult,
} from '@qgs/shared';

import { MasterDataGovernanceKernel } from '~/governance/master-data/master-data-governance-kernel';

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

export const SupervisionPlanTaskService = {
  async deadlineBoard(params?: {
    dueSoonDays?: number;
    projectId?: string;
  }): Promise<DeadlineBoardResult> {
    const dueSoonDays = params?.dueSoonDays ?? 7;
    const now = new Date();
    const projectWhere: any = {
      isDeleted: false,
      status: { in: ['PLANNED', 'IN_PROGRESS'] },
    };
    if (params?.projectId) projectWhere.id = params.projectId;

    // governance-allow-direct-name-id: select projection for read-only board aggregation.
    const projects = await prisma.supervision_projects.findMany({
      select: {
        id: true,
        projectId: true,
        projectName: true,
        supplierId: true,
        supplierName: true,
      },
      where: projectWhere,
    });
    const [projectNameById, supplierNameById] = await Promise.all([
      MasterDataGovernanceKernel.resolveCanonicalNamesByIds({
        configKey: 'projectName',
        canonicalIds: projects.map((item) => item.projectId),
      }),
      MasterDataGovernanceKernel.resolveCanonicalNamesByIds({
        configKey: 'supplierName',
        canonicalIds: projects.map((item) => item.supplierId),
      }),
    ]);
    const projectIds = projects.map((p) => p.id);
    if (projectIds.length === 0) {
      return {
        byProject: [],
        delayed: [],
        dueSoon: [],
        risk: [],
        summary: {
          delayedCount: 0,
          dueSoonCount: 0,
          healthyPercent: 100,
          riskCount: 0,
          totalProjects: 0,
        },
      };
    }

    const tasks = await prisma.supervision_plan_tasks.findMany({
      where: {
        isDeleted: false,
        isSummary: false,
        projectId: { in: projectIds },
        status: { notIn: ['DONE'] },
      },
      orderBy: { plannedEndAt: 'asc' },
    });

    const projectMap = new Map(projects.map((p) => [p.id, p]));
    const delayed: DeadlineBoardTask[] = [];
    const dueSoon: DeadlineBoardTask[] = [];
    const risk: DeadlineBoardTask[] = [];

    for (const row of tasks) {
      const mapped = mapPlanTask(row);
      const project = projectMap.get(row.projectId);
      const canonicalProjectName = projectNameById.get(
        String(project?.projectId || ''),
      );
      const canonicalSupplierName = supplierNameById.get(
        String(project?.supplierId || ''),
      );
      // governance-allow-direct-name-id: canonical names are resolved above via governance kernel.
      const task: DeadlineBoardTask = {
        ...mapped,
        projectName: canonicalProjectName || project?.projectName || '',
        supplierName: canonicalSupplierName || project?.supplierName || '',
      };

      const endAt = row.plannedEndAt ? new Date(row.plannedEndAt) : null;
      if (endAt) {
        const endOfDay = new Date(endAt);
        endOfDay.setHours(23, 59, 59, 999);
        if (endOfDay < now) {
          delayed.push(task);
          continue;
        }
        const diffMs = endOfDay.getTime() - now.getTime();
        const diffDays = diffMs / (24 * 60 * 60 * 1000);
        if (diffDays <= dueSoonDays) {
          dueSoon.push(task);
          continue;
        }
      }

      const isRiskFlag = (row.riskLevel || '').toUpperCase() === 'RISK';
      if (isRiskFlag) {
        risk.push(task);
        continue;
      }

      const startAt = row.plannedStartAt ? new Date(row.plannedStartAt) : null;
      if (startAt && endAt && startAt < now) {
        const totalDuration = endAt.getTime() - startAt.getTime();
        const elapsed = now.getTime() - startAt.getTime();
        if (totalDuration > 0) {
          const expectedProgress = (elapsed / totalDuration) * 100;
          const actualProgress = mapPlanTask(row).progressPercent;
          if (actualProgress < expectedProgress * 0.7) {
            risk.push(task);
          }
        }
      }
    }

    const byProjectMap = new Map<
      string,
      { delayed: number; dueSoon: number; risk: number }
    >();
    for (const t of delayed) {
      const s = byProjectMap.get(t.projectId) ?? {
        delayed: 0,
        dueSoon: 0,
        risk: 0,
      };
      s.delayed++;
      byProjectMap.set(t.projectId, s);
    }
    for (const t of dueSoon) {
      const s = byProjectMap.get(t.projectId) ?? {
        delayed: 0,
        dueSoon: 0,
        risk: 0,
      };
      s.dueSoon++;
      byProjectMap.set(t.projectId, s);
    }
    for (const t of risk) {
      const s = byProjectMap.get(t.projectId) ?? {
        delayed: 0,
        dueSoon: 0,
        risk: 0,
      };
      s.risk++;
      byProjectMap.set(t.projectId, s);
    }

    const totalLeafTasks = tasks.length;
    const problemCount = delayed.length + dueSoon.length + risk.length;
    const healthyPercent =
      totalLeafTasks > 0
        ? Math.round(((totalLeafTasks - problemCount) / totalLeafTasks) * 100)
        : 100;

    return {
      byProject: projects
        .map((p) => {
          const s = byProjectMap.get(p.id) ?? {
            delayed: 0,
            dueSoon: 0,
            risk: 0,
          };
          const projectLeafTasks = tasks.filter((t) => t.projectId === p.id);
          const projectItems = projectLeafTasks.map((t) => mapPlanTask(t));
          const overallProgress =
            summarizePlanTasks(projectItems).progressPercent;
          return {
            delayedCount: s.delayed,
            dueSoonCount: s.dueSoon,
            overallProgress,
            projectId: p.id,
            projectName: p.projectName,
            riskCount: s.risk,
            supplierName: p.supplierName || '',
          };
        })
        .filter((p) => p.delayedCount + p.dueSoonCount + p.riskCount > 0),
      delayed,
      dueSoon,
      risk,
      summary: {
        delayedCount: delayed.length,
        dueSoonCount: dueSoon.length,
        healthyPercent,
        riskCount: risk.length,
        totalProjects: projects.length,
      },
    };
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
  ): Promise<SupervisionPlanTaskImportResult> {
    return SupervisionPlanTaskImportService.importPlanTasks(
      projectId,
      payload,
      this.listPlanTasks.bind(this),
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
  ): Promise<SupervisionPlanTaskImportResult> {
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
            where: { id: parentId },
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
    await prisma.supervision_plan_tasks.create({
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
    await syncSupervisionProjectProgress(projectId);
    return this.listPlanTasks(projectId);
  },

  async updateTask(
    projectId: string,
    taskId: string,
    payload: Record<string, unknown>,
  ): Promise<SupervisionPlanTaskImportResult> {
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
            where: { id: newParentId },
          });
        }
      } else {
        data.outlineLevel = 1;
      }
    }

    await prisma.supervision_plan_tasks.update({
      data,
      where: { id: taskId, projectId },
    });
    await syncSupervisionProjectProgress(projectId);
    return this.listPlanTasks(projectId);
  },

  async deleteTask(
    projectId: string,
    taskId: string,
  ): Promise<SupervisionPlanTaskImportResult> {
    await prisma.$transaction(async (tx) => {
      const task = await tx.supervision_plan_tasks.findFirst({
        where: { id: taskId, isDeleted: false, projectId },
      });
      if (!task) throw new Error('任务不存在');
      await tx.supervision_plan_tasks.updateMany({
        data: { outlineLevel: task.outlineLevel, parentId: task.parentId },
        where: { isDeleted: false, parentId: taskId, projectId },
      });
      await tx.supervision_plan_tasks.update({
        data: { isDeleted: true },
        where: { id: taskId },
      });
      if (task.parentId) {
        const siblingCount = await tx.supervision_plan_tasks.count({
          where: { isDeleted: false, parentId: task.parentId, projectId },
        });
        if (siblingCount === 0) {
          await tx.supervision_plan_tasks.update({
            data: { isSummary: false },
            where: { id: task.parentId },
          });
        }
      }
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
  ): Promise<SupervisionPlanTaskImportResult> {
    await prisma.$transaction(async (tx) => {
      for (const item of items) {
        const data: any = { sortOrder: item.sortOrder };
        if (item.parentId !== undefined) data.parentId = item.parentId || null;
        if (item.outlineLevel !== undefined)
          data.outlineLevel = item.outlineLevel;
        await tx.supervision_plan_tasks.update({
          data,
          where: { id: item.id, projectId },
        });
      }
      const allTasks = await tx.supervision_plan_tasks.findMany({
        select: { id: true, parentId: true },
        where: { isDeleted: false, projectId },
      });
      const parentIds = new Set(
        allTasks.map((t) => t.parentId).filter(Boolean) as string[],
      );
      for (const task of allTasks) {
        const shouldBeSummary = parentIds.has(task.id);
        await tx.supervision_plan_tasks.update({
          data: { isSummary: shouldBeSummary },
          where: { id: task.id },
        });
      }
    });
    await syncSupervisionProjectProgress(projectId);
    return this.listPlanTasks(projectId);
  },
};
