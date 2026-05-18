import type {
  DeadlineBoardResult,
  DeadlineBoardTask,
  SupervisionPlanTaskImportResult,
} from '@qgs/shared';

import { extname } from 'node:path';

import { FileStorageService } from '~/services/file-storage.service';

import {
  buildPlanTaskTree,
  calculatePlanTaskStatus,
  calculateQuantityProgress,
  EXCEL_EXTENSIONS,
  mapPlanTask,
  normalizeDate,
  normalizeDurationDays,
  normalizePercent,
  normalizePositiveQuantity,
  normalizeQuantity,
  normalizeText,
  prisma,
  rollupSummaryTasks,
  summarizePlanTasks,
} from './supervision-shared';

function normalizeSourceFileName(fileUrl: string, fileName?: string) {
  const provided = normalizeText(fileName);
  if (provided) return provided;
  const rawName = decodeURIComponent(fileUrl.split('/').pop() || '');
  const match = rawName.match(/^[\da-z]+-(.+)$/i);
  return match?.[1] || rawName;
}

async function readUploadedWorkbook(
  fileUrl: string,
  fileName?: string,
  storedName?: string,
) {
  const lookupName =
    normalizeText(storedName) || normalizeSourceFileName(fileUrl);
  const sourceFileName = normalizeText(fileName) || lookupName;
  const extension = extname(lookupName).toLowerCase();
  if (!EXCEL_EXTENSIONS.has(extension)) {
    throw new Error('仅支持 .xls 或 .xlsx 计划文件');
  }
  const managedFile =
    await FileStorageService.getFileBufferByStoredName(lookupName);
  if (!managedFile) {
    throw new Error('未找到上传的计划文件');
  }
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(managedFile.buffer, {
    cellDates: true,
    type: 'buffer',
  });
  return { sourceFileName, utils: XLSX.utils, workbook };
}
function resolveHeaderValue(row: Record<string, unknown>, names: string[]) {
  for (const name of names) {
    if (row[name] !== undefined) return row[name];
  }
  const entries = Object.entries(row);
  for (const [key, value] of entries) {
    const normalizedKey = key.replaceAll(/\s+/g, '').toLowerCase();
    if (
      names.some(
        (name) => name.replaceAll(/\s+/g, '').toLowerCase() === normalizedKey,
      )
    ) {
      return value;
    }
  }
  return undefined;
}

function parseOutlineLevelValue(raw: unknown): null | number {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = Number(String(raw).trim());
  if (Number.isFinite(n) && n >= 1) return Math.floor(n);
  return null;
}

function inferLevelFromCode(code: string): number {
  if (!code) return 0;
  const parts = code
    .replaceAll(/\s+/g, '')
    .split(/[.．。·\-_]/)
    .filter(Boolean);
  return parts.length;
}

function parseWorkbookTasks(
  workbook: any,
  utils: { sheet_to_json: (...args: any[]) => unknown[] },
  sourceFileName: string,
  fileUrl: string,
) {
  const sheetName = workbook.SheetNames?.[0];
  if (!sheetName) throw new Error('计划文件没有工作表');
  const sheet = workbook.Sheets[sheetName];
  const rows = utils.sheet_to_json(sheet, {
    defval: '',
    raw: false,
  }) as Array<Record<string, unknown>>;
  const tasks = rows
    .map((row, index) => {
      const taskNo = normalizeText(
        resolveHeaderValue(row, ['标识号', 'ID', 'id', '任务ID']),
      );
      const taskName = normalizeText(
        resolveHeaderValue(row, ['Task_Name', 'Task Name', '任务名称']),
      );
      if (!taskNo || !taskName) return null;
      const plannedStartAt = normalizeDate(
        resolveHeaderValue(row, ['开始时间', 'Start', 'Start Time']),
      );
      const plannedEndAt = normalizeDate(
        resolveHeaderValue(row, ['完成时间', 'Finish', 'End Time']),
      );
      const wbs = normalizeText(
        resolveHeaderValue(row, [
          'WBS',
          '工作分解结构',
          'wbs',
          '大纲编号',
          'Outline Number',
        ]),
      );
      const explicitLevel = parseOutlineLevelValue(
        resolveHeaderValue(row, [
          'Outline Level',
          '大纲级别',
          'OutlineLevel',
          '级别',
          '层级',
        ]),
      );
      const outlineLevel =
        explicitLevel ??
        (inferLevelFromCode(wbs) || inferLevelFromCode(taskNo) || 1);
      const outlineNumber = wbs || taskNo;
      return {
        durationDays: normalizeDurationDays(
          resolveHeaderValue(row, ['工期', 'Duration']),
        ),
        durationText: normalizeText(
          resolveHeaderValue(row, ['工期', 'Duration']),
        ),
        outlineLevel,
        outlineNumber,
        plannedEndAt,
        plannedStartAt,
        predecessorText: normalizeText(
          resolveHeaderValue(row, ['前置任务', 'Predecessors']),
        ),
        progressPercent: normalizePercent(
          resolveHeaderValue(row, ['完成百分比', '百分比', '% Complete']),
        ),
        resourceName: normalizeText(
          resolveHeaderValue(row, ['资源名称', 'Resource Names']),
        ),
        sortOrder: index,
        sourceFileName,
        sourceFileUrl: fileUrl,
        taskName,
        taskNo,
      };
    })
    .filter(Boolean) as Array<Record<string, any>>;
  if (tasks.length === 0) {
    throw new Error('未识别到任务计划数据');
  }
  attachHierarchy(tasks);
  return tasks;
}

function attachHierarchy(tasks: Array<Record<string, any>>) {
  const stack: Array<{ outlineLevel: number; taskNo: string }> = [];
  for (const task of tasks) {
    const level = Number(task.outlineLevel) || 1;
    while (stack.length > 0) {
      const last = stack.at(-1);
      if (!last || last.outlineLevel < level) break;
      stack.pop();
    }
    task.parentTaskNo = stack.at(-1)?.taskNo ?? null;
    task.outlineLevel = level;
    stack.push({ outlineLevel: level, taskNo: String(task.taskNo) });
  }
  const parentSet = new Set(
    tasks.map((task) => task.parentTaskNo).filter(Boolean) as string[],
  );
  for (const task of tasks) {
    task.isSummary = parentSet.has(String(task.taskNo));
  }
}

async function syncProjectProgress(projectId: string) {
  const rows = await prisma.supervision_plan_tasks.findMany({
    where: { isDeleted: false, isSummary: false, projectId },
  });
  const items = rows.map((row) => mapPlanTask(row));
  const progress = summarizePlanTasks(items).progressPercent;
  await prisma.supervision_projects.update({
    data: {
      progressPercent: progress,
      status: progress >= 100 ? 'COMPLETED' : undefined,
    },
    where: { id: projectId },
  });
}

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

    const projects = await prisma.supervision_projects.findMany({
      select: { id: true, projectName: true, supplierName: true },
      where: projectWhere,
    });
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
      const task: DeadlineBoardTask = {
        ...mapped,
        projectName: project?.projectName || '',
        supplierName: project?.supplierName || '',
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
    const fileUrl = normalizeText(payload.fileUrl);
    if (!fileUrl) throw new Error('计划文件不能为空');
    const { sourceFileName, utils, workbook } = await readUploadedWorkbook(
      fileUrl,
      normalizeText(payload.fileName),
      normalizeText(payload.storedName),
    );
    const tasks = parseWorkbookTasks(workbook, utils, sourceFileName, fileUrl);

    await prisma.$transaction(async (tx) => {
      await tx.supervision_plan_tasks.updateMany({
        data: { isDeleted: true },
        where: { projectId },
      });
      const idByTaskNo = new Map<string, string>();
      for (const task of tasks) {
        const progressPercent = normalizePercent(task.progressPercent);
        const plannedStartAt = task.plannedStartAt as Date | undefined;
        const plannedEndAt = task.plannedEndAt as Date | undefined;
        const plannedQuantity = normalizePositiveQuantity(
          task.plannedQuantity,
          1,
        );
        const completedQuantity = normalizeQuantity(
          task.completedQuantity,
          (plannedQuantity * progressPercent) / 100,
        );
        const isSummary = Boolean(task.isSummary);
        const created = await tx.supervision_plan_tasks.create({
          data: {
            completedQuantity,
            durationDays:
              typeof task.durationDays === 'number' ? task.durationDays : null,
            durationText: normalizeText(task.durationText) || null,
            isSummary,
            outlineLevel: Number(task.outlineLevel) || 1,
            outlineNumber: normalizeText(task.outlineNumber) || null,
            parentId: task.parentTaskNo
              ? (idByTaskNo.get(String(task.parentTaskNo)) ?? null)
              : null,
            plannedEndAt,
            plannedStartAt,
            plannedQuantity,
            predecessorText: normalizeText(task.predecessorText) || null,
            progressPercent: calculateQuantityProgress(
              completedQuantity,
              plannedQuantity,
            ),
            projectId,
            quantityUnit: normalizeText(task.quantityUnit) || '项',
            resourceName: normalizeText(task.resourceName) || null,
            sortOrder: Number(task.sortOrder || 0),
            sourceFileName,
            sourceFileUrl: fileUrl,
            status: calculatePlanTaskStatus({
              plannedEndAt,
              plannedStartAt,
              progressPercent: calculateQuantityProgress(
                completedQuantity,
                plannedQuantity,
              ),
            }),
            taskName: normalizeText(task.taskName),
            taskNo: normalizeText(task.taskNo),
            weight: normalizePositiveQuantity(task.weight, 1),
          },
        });
        idByTaskNo.set(String(task.taskNo), created.id);
      }
      await tx.supervision_projects.update({
        data: { status: 'IN_PROGRESS' },
        where: { id: projectId },
      });
    });

    await syncProjectProgress(projectId);
    return this.listPlanTasks(projectId);
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
    await syncProjectProgress(projectId);
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
    await syncProjectProgress(projectId);
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
    await syncProjectProgress(projectId);
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
    await syncProjectProgress(projectId);
    return this.listPlanTasks(projectId);
  },
};
