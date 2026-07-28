import type { H3Event } from 'h3';
import type {
  BomInspectionProgress,
  ProjectBomItemRow,
} from '~/modules/planning/bom';

import { getQuery } from 'h3';
import {
  mapProjectBomItem,
  normalizeBomText,
  projectBomItemSelect,
} from '~/modules/planning/bom';
import { logApiError } from '~/utils/api-logger';
import { awaitMockDelay } from '~/utils/index';
import prisma from '~/utils/prisma';
import {
  internalServerErrorResponse,
  useListResponseSuccess,
} from '~/utils/response';

function buildInspectionKey(partId: unknown, processId: unknown) {
  const normalizedPartId = String(partId || '').trim();
  const normalizedProcessId = String(processId || '').trim();
  return normalizedPartId && normalizedProcessId
    ? JSON.stringify([normalizedPartId, normalizedProcessId])
    : null;
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
      partId: true,
      processId: true,
      qualifiedQuantity: true,
      quantity: true,
      workOrderNumber: true,
    },
  });

  const completedQuantityMap = new Map<string, number>();
  for (const inspection of inspections) {
    const identityKey = buildInspectionKey(
      inspection.partId,
      inspection.processId,
    );
    if (!identityKey) continue;
    const quantity = Number(
      inspection.qualifiedQuantity || inspection.quantity || 0,
    );
    const key = `${inspection.workOrderNumber}::${identityKey}`;
    completedQuantityMap.set(
      key,
      (completedQuantityMap.get(key) || 0) + quantity,
    );
  }

  return items.map((item) => {
    const inspectionProgress: BomInspectionProgress[] =
      item.processRequirements.map((requirement) => {
        const processId = String(requirement.processId || '').trim() || null;
        const processName =
          String(requirement.process?.name || '').trim() ||
          requirement.processName;
        const identityKey = buildInspectionKey(item.partId, processId);
        const completedQuantity =
          (identityKey
            ? completedQuantityMap.get(
                `${item.work_order_number}::${identityKey}`,
              )
            : 0) || 0;
        const requiredQuantity = Number(item.quantity || 0);
        const remainingQuantity = Math.max(
          requiredQuantity - completedQuantity,
          0,
        );
        let processResolutionStatus: BomInspectionProgress['processResolutionStatus'];
        if (requirement.process) {
          processResolutionStatus = 'RESOLVED';
        } else {
          processResolutionStatus = processId ? 'INVALID' : 'MISSING';
        }
        return {
          completed:
            requiredQuantity > 0 && completedQuantity >= requiredQuantity,
          completedQuantity,
          processId,
          processName,
          processResolutionStatus,
          remainingQuantity,
          requiredQuantity,
        };
      });
    return { ...item, inspectionProgress };
  });
}

export async function bom_index_get(event: H3Event) {
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
      return useListResponseSuccess(
        enrichedItems.map((item) => mapProjectBomItem(item)),
      );
    }

    const allItems = await prisma.project_boms.findMany({
      select: projectBomItemSelect,
      orderBy: [{ part_number: 'asc' }, { created_at: 'desc' }],
    });
    const enrichedItems = await attachInspectionProgress(allItems);
    return useListResponseSuccess(
      enrichedItems.map((item) => mapProjectBomItem(item)),
    );
  } catch (error) {
    logApiError('bom-list', error, undefined, event);
    return internalServerErrorResponse(event, '获取 BOM 条目失败');
  }
}
