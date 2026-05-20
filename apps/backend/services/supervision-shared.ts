import type {
  SupervisionPlanTask,
  SupervisionPlanTaskStatus,
} from '@qgs/shared';

import {
  ISSUE_TRACKING_STATUS,
  SUPERVISION_PROJECT_STATUS,
  SUPERVISION_PROJECT_TYPE,
  calculateSupervisionPlanTaskStatus,
  calculateSupervisionQuantityProgress,
  normalizeSupervisionDate,
  normalizeSupervisionDurationDays,
  normalizeSupervisionIssueStatus,
  normalizeSupervisionPercent,
  normalizeSupervisionPositiveQuantity,
  normalizeSupervisionProjectStatus,
  normalizeSupervisionProjectType,
  normalizeSupervisionQuantity,
  normalizeSupervisionText,
  parseSupervisionList,
  stringifySupervisionList,
} from '@qgs/domain';

export const PROJECT_STATUSES = new Set(Object.values(SUPERVISION_PROJECT_STATUS));
export const PROJECT_TYPES = new Set(Object.values(SUPERVISION_PROJECT_TYPE));
export const EXCEL_EXTENSIONS = new Set(['.xls', '.xlsx']);

export function normalizeText(value: unknown) {
  return normalizeSupervisionText(value);
}

export function normalizeDate(value: unknown) {
  return normalizeSupervisionDate(value);
}

export function normalizePercent(value: unknown, fallback = 0) {
  return normalizeSupervisionPercent(value, fallback);
}

export function normalizeQuantity(value: unknown, fallback = 0) {
  return normalizeSupervisionQuantity(value, fallback);
}

export function normalizePositiveQuantity(value: unknown, fallback = 1) {
  return normalizeSupervisionPositiveQuantity(value, fallback);
}

export function calculateQuantityProgress(completed: number, planned: number) {
  return calculateSupervisionQuantityProgress(completed, planned);
}

export function normalizeDurationDays(value: unknown) {
  return normalizeSupervisionDurationDays(value);
}

export function stringifyList(value: unknown) {
  return stringifySupervisionList(value);
}

export function parseList(value?: null | string) {
  return parseSupervisionList(value);
}

export function normalizeProjectStatus(value: unknown) {
  return normalizeSupervisionProjectStatus(value);
}

export function normalizeProjectType(value: unknown) {
  return normalizeSupervisionProjectType(value);
}

export function normalizeIssueStatus(value: unknown) {
  return normalizeSupervisionIssueStatus(value);
}

export function calculatePlanTaskStatus(task: {
  actualEndAt?: Date | null;
  actualStartAt?: Date | null;
  plannedEndAt?: Date | null;
  plannedStartAt?: Date | null;
  progressPercent?: null | number;
  riskLevel?: null | string;
}): SupervisionPlanTaskStatus {
  return calculateSupervisionPlanTaskStatus(task);
}

export function mapPlanTask(row: any) {
  const plannedQuantity = normalizePositiveQuantity(row.plannedQuantity, 1);
  const storedProgress = normalizePercent(row.progressPercent);
  const completedQuantity =
    normalizeQuantity(row.completedQuantity, 0) ||
    normalizeQuantity((plannedQuantity * storedProgress) / 100, 0);
  const progressPercent = calculateQuantityProgress(
    completedQuantity,
    plannedQuantity,
  );
  return {
    actualEndAt: row.actualEndAt ? row.actualEndAt.toISOString() : '',
    actualStartAt: row.actualStartAt ? row.actualStartAt.toISOString() : '',
    completedQuantity,
    createdAt: row.createdAt?.toISOString(),
    durationDays: row.durationDays ?? undefined,
    durationText: row.durationText || '',
    id: row.id,
    isSummary: Boolean(row.isSummary),
    lastReportAt: row.lastReportAt ? row.lastReportAt.toISOString() : '',
    lastReportId: row.lastReportId || '',
    outlineLevel: row.outlineLevel ?? 1,
    outlineNumber: row.outlineNumber || '',
    parentId: row.parentId || '',
    plannedEndAt: row.plannedEndAt ? row.plannedEndAt.toISOString() : '',
    plannedStartAt: row.plannedStartAt ? row.plannedStartAt.toISOString() : '',
    plannedQuantity,
    predecessorText: row.predecessorText || '',
    progressPercent,
    projectId: row.projectId,
    quantityUnit: row.quantityUnit || '项',
    resourceName: row.resourceName || '',
    riskLevel: row.riskLevel || 'NORMAL',
    riskReason: row.riskReason || '',
    sortOrder: row.sortOrder || 0,
    sourceFileName: row.sourceFileName || '',
    sourceFileUrl: row.sourceFileUrl || '',
    status: calculatePlanTaskStatus({ ...row, progressPercent }),
    taskName: row.taskName,
    taskNo: row.taskNo,
    updatedAt: row.updatedAt?.toISOString(),
    weight: normalizePositiveQuantity(row.weight, 1),
  } satisfies SupervisionPlanTask;
}

export function summarizePlanTasks(tasks: SupervisionPlanTask[]) {
  const summary = {
    delayed: 0,
    done: 0,
    dueSoon: 0,
    inProgress: 0,
    notStarted: 0,
    progressPercent: 0,
    total: tasks.length,
  };
  let progressTotal = 0;
  let weightTotal = 0;
  for (const task of tasks) {
    const weight = normalizePositiveQuantity(task.weight, 1);
    weightTotal += weight;
    progressTotal += (task.progressPercent || 0) * weight;
    switch (task.status) {
      case 'DELAYED': {
        summary.delayed += 1;
        break;
      }
      case 'DONE': {
        summary.done += 1;
        break;
      }
      case 'DUE_SOON': {
        summary.dueSoon += 1;
        break;
      }
      case 'IN_PROGRESS': {
        summary.inProgress += 1;
        break;
      }
      default: {
        summary.notStarted += 1;
      }
    }
  }
  summary.progressPercent =
    weightTotal > 0 ? Math.round(progressTotal / weightTotal) : 0;
  return summary;
}

export function rollupSummaryTasks(tasks: SupervisionPlanTask[]) {
  const childrenByParent = new Map<string, SupervisionPlanTask[]>();
  const byId = new Map<string, SupervisionPlanTask>();
  for (const task of tasks) {
    byId.set(task.id, task);
    if (task.parentId) {
      const list = childrenByParent.get(task.parentId) ?? [];
      list.push(task);
      childrenByParent.set(task.parentId, list);
    }
  }
  const sorted = [...tasks].sort(
    (a, b) => (b.outlineLevel || 1) - (a.outlineLevel || 1),
  );
  for (const task of sorted) {
    if (!task.isSummary) continue;
    const children = childrenByParent.get(task.id) ?? [];
    if (children.length === 0) continue;

    const starts = children
      .map((c) => (c.plannedStartAt ? Date.parse(c.plannedStartAt) : null))
      .filter((v): v is number => v !== null && Number.isFinite(v));
    const ends = children
      .map((c) => (c.plannedEndAt ? Date.parse(c.plannedEndAt) : null))
      .filter((v): v is number => v !== null && Number.isFinite(v));
    task.plannedStartAt =
      starts.length > 0 ? new Date(Math.min(...starts)).toISOString() : '';
    task.plannedEndAt =
      ends.length > 0 ? new Date(Math.max(...ends)).toISOString() : '';

    const actualStarts = children
      .map((c) => (c.actualStartAt ? Date.parse(c.actualStartAt) : null))
      .filter((v): v is number => v !== null && Number.isFinite(v));
    task.actualStartAt =
      actualStarts.length > 0
        ? new Date(Math.min(...actualStarts)).toISOString()
        : '';
    const allDone = children.every((c) => c.status === 'DONE');
    const actualEnds = children
      .map((c) => (c.actualEndAt ? Date.parse(c.actualEndAt) : null))
      .filter((v): v is number => v !== null && Number.isFinite(v));
    task.actualEndAt =
      allDone && actualEnds.length === children.length
        ? new Date(Math.max(...actualEnds)).toISOString()
        : '';

    let weightedProgress = 0;
    let totalWeight = 0;
    let plannedQty = 0;
    let completedQty = 0;
    for (const child of children) {
      const w = normalizePositiveQuantity(child.weight, 1);
      totalWeight += w;
      weightedProgress += (child.progressPercent || 0) * w;
      plannedQty += child.plannedQuantity || 0;
      completedQty += child.completedQuantity || 0;
    }
    task.progressPercent =
      totalWeight > 0 ? Math.round(weightedProgress / totalWeight) : 0;
    task.plannedQuantity = plannedQty || task.plannedQuantity;
    task.completedQuantity = completedQty;

    if (task.plannedStartAt && task.plannedEndAt) {
      const days =
        Math.round(
          (Date.parse(task.plannedEndAt) - Date.parse(task.plannedStartAt)) /
            (24 * 60 * 60 * 1000),
        ) + 1;
      task.durationDays = Math.max(1, days);
    }

    task.status = calculatePlanTaskStatus({
      actualEndAt: task.actualEndAt ? new Date(task.actualEndAt) : null,
      actualStartAt: task.actualStartAt ? new Date(task.actualStartAt) : null,
      plannedEndAt: task.plannedEndAt ? new Date(task.plannedEndAt) : null,
      plannedStartAt: task.plannedStartAt
        ? new Date(task.plannedStartAt)
        : null,
      progressPercent: task.progressPercent,
      riskLevel: task.riskLevel,
    });
  }
}

export function buildPlanTaskTree(tasks: SupervisionPlanTask[]) {
  type Node = SupervisionPlanTask & { children: Node[] };
  const nodes = new Map<string, Node>();
  for (const task of tasks) nodes.set(task.id, { ...task, children: [] });
  const roots: Node[] = [];
  for (const task of tasks) {
    const node = nodes.get(task.id);
    if (!node) continue;
    const parent = task.parentId ? nodes.get(task.parentId) : undefined;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

export { default as prisma } from '~/utils/prisma';
