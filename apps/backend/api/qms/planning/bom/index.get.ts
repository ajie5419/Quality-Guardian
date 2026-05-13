import type { BomInspectionProgress, ProjectBomItemRow } from '~/utils/bom';

import { defineEventHandler, getQuery } from 'h3';
import { logApiError } from '~/utils/api-logger';
import {
  mapProjectBomItem,
  normalizeBomText,
  parseBomRequiredProcesses,
  projectBomItemSelect,
} from '~/utils/bom';
import { awaitMockDelay } from '~/utils/index';
import prisma from '~/utils/prisma';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

function normalizeCompareText(value: unknown) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function buildInspectionKey(partName: unknown, processName: unknown) {
  return `${normalizeCompareText(partName)}::${normalizeCompareText(processName)}`;
}

async function attachInspectionProgress(items: ProjectBomItemRow[]) {
  const workOrderNumbers = [
    ...new Set(items.map((item) => item.work_order_number)),
  ];
  if (items.length === 0 || workOrderNumbers.length === 0) return items;

  const inspections = await prisma.inspections.findMany({
    where: {
      category: 'PROCESS',
      isDeleted: false,
      workOrderNumber: { in: workOrderNumbers },
    },
    select: {
      level1Component: true,
      level2Component: true,
      materialName: true,
      processName: true,
      qualifiedQuantity: true,
      quantity: true,
      workOrderNumber: true,
    },
  });

  const completedQuantityMap = new Map<string, number>();
  for (const inspection of inspections) {
    const partCandidates = [
      inspection.materialName,
      inspection.level2Component,
      inspection.level1Component,
    ].filter(Boolean);
    const quantity = Number(
      inspection.qualifiedQuantity || inspection.quantity || 0,
    );
    for (const partName of partCandidates) {
      const key = `${inspection.workOrderNumber}::${buildInspectionKey(
        partName,
        inspection.processName,
      )}`;
      completedQuantityMap.set(
        key,
        (completedQuantityMap.get(key) || 0) + quantity,
      );
    }
  }

  return items.map((item) => {
    const requiredProcesses = parseBomRequiredProcesses(
      item.required_processes,
    );
    const inspectionProgress: BomInspectionProgress[] = requiredProcesses.map(
      (processName) => {
        const completedQuantity =
          completedQuantityMap.get(
            `${item.work_order_number}::${buildInspectionKey(
              item.part_name,
              processName,
            )}`,
          ) || 0;
        const requiredQuantity = Number(item.quantity || 0);
        const remainingQuantity = Math.max(
          requiredQuantity - completedQuantity,
          0,
        );
        return {
          completed:
            requiredQuantity > 0 && completedQuantity >= requiredQuantity,
          completedQuantity,
          processName,
          remainingQuantity,
          requiredQuantity,
        };
      },
    );
    return { ...item, inspectionProgress };
  });
}

export default defineEventHandler(async (event) => {
  await awaitMockDelay();
  const query = getQuery(event);
  const projectId = normalizeBomText(query.projectId);

  try {
    if (projectId) {
      // 这里的 projectId 可能是 bom_projects.id，也可能是 workOrderNumber
      // 先尝试作为 bom_projects.id 查找
      const bomProject = await prisma.bom_projects.findUnique({
        where: { id: projectId },
      });

      const workOrderNumber = bomProject
        ? bomProject.workOrderNumber
        : projectId;

      const items = await prisma.project_boms.findMany({
        where: { work_order_number: workOrderNumber },
        select: projectBomItemSelect,
        orderBy: [{ part_number: 'asc' }, { created_at: 'desc' }],
      });

      const enrichedItems = await attachInspectionProgress(items);
      return useResponseSuccess(
        enrichedItems.map((item) => mapProjectBomItem(item)),
      );
    }

    const allItems = await prisma.project_boms.findMany({
      select: projectBomItemSelect,
      orderBy: [{ part_number: 'asc' }, { created_at: 'desc' }],
    });
    const enrichedItems = await attachInspectionProgress(allItems);
    return useResponseSuccess(
      enrichedItems.map((item) => mapProjectBomItem(item)),
    );
  } catch (error) {
    logApiError('bom-list', error);
    return internalServerErrorResponse(event, '获取 BOM 条目失败');
  }
});
