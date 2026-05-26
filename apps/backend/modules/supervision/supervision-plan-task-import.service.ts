import type { SupervisionPlanTaskImportResult } from '@qgs/shared';

import { extname } from 'node:path';

import { FileStorageService } from '~/modules/file-storage/file-storage.service';
import { parseSheet, parseWorkbook } from '~/utils/excel-parser';

import { syncSupervisionProjectProgress } from './supervision-plan-task-progress';
import {
  calculatePlanTaskStatus,
  calculateQuantityProgress,
  EXCEL_EXTENSIONS,
  normalizeDate,
  normalizeDurationDays,
  normalizePercent,
  normalizePositiveQuantity,
  normalizeQuantity,
  normalizeText,
  prisma,
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
  const workbook = await parseWorkbook(managedFile.buffer, {
    cellDates: true,
  });
  return { sourceFileName, workbook };
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

async function parseWorkbookTasks(
  workbook: Awaited<ReturnType<typeof parseWorkbook>>,
  sourceFileName: string,
  fileUrl: string,
) {
  const sheetName = workbook.SheetNames?.[0];
  if (!sheetName) throw new Error('计划文件没有工作表');
  const rows = await parseSheet<Record<string, unknown>>(workbook, sheetName, {
    defval: '',
    raw: false,
  });
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

export const SupervisionPlanTaskImportService = {
  async importPlanTasks(
    projectId: string,
    payload: Record<string, unknown>,
    listPlanTasks: (
      projectId: string,
    ) => Promise<SupervisionPlanTaskImportResult>,
  ): Promise<SupervisionPlanTaskImportResult> {
    const fileUrl = normalizeText(payload.fileUrl);
    if (!fileUrl) throw new Error('计划文件不能为空');
    const { sourceFileName, workbook } = await readUploadedWorkbook(
      fileUrl,
      normalizeText(payload.fileName),
      normalizeText(payload.storedName),
    );
    const tasks = await parseWorkbookTasks(workbook, sourceFileName, fileUrl);

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

    await syncSupervisionProjectProgress(projectId);
    return listPlanTasks(projectId);
  },
};
