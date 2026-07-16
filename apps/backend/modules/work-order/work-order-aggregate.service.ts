import { InspectionService } from '~/modules/inspection';
import { WorkOrderRequirementService } from '~/modules/work-order-requirement/work-order-requirement.service';
import prisma from '~/utils/prisma';
import { resolveCanonicalProcessName } from '~/utils/process-resolver';

import { parseRequirementAttachments } from './work-order-requirement-attachments';

type GroupStats = {
  inspectedPoints: number;
  partName: string;
  plannedPoints: number;
  processName: string;
};
type AggregateAttachment = { name?: string; type?: string; url: string };
type ProcessProgressGroup = {
  latestDate: Date;
  partName: string;
  processStats: Map<string, { completedQuantity: number; latestDate: Date }>;
  teams: Set<string>;
  totalQuantity: number;
};

function getTodayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setHours(23, 59, 59, 999);
  return { end, start };
}
function parseRequirementItems(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== 'string' || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
function resolveRequirementPoints(requirementItems: unknown) {
  const parsed = parseRequirementItems(requirementItems);
  return parsed.length > 0 ? parsed.length : 1;
}
function compactAggregateAttachments(
  attachments: Array<AggregateAttachment & { thumbUrl?: string }>,
): AggregateAttachment[] {
  return attachments.map(({ name, type, url }) => ({ name, type, url }));
}
function normalizeLabel(value: unknown) {
  return String(value || '').trim() || '未填写';
}
function getGroupKey(partName: string, processName: string) {
  return `${partName}@@${processName}`;
}
function mapDimensionStats(
  map: Map<string, { inspectedPoints: number; plannedPoints: number }>,
  keyName: 'partName' | 'processName',
) {
  return [...map.entries()]
    .map(([key, value]) => {
      const plannedPoints = value.plannedPoints;
      const inspectedPoints = Math.min(
        value.inspectedPoints,
        plannedPoints || 0,
      );
      const missingPoints = Math.max(plannedPoints - inspectedPoints, 0);
      const completionRate =
        plannedPoints > 0
          ? Number(((inspectedPoints / plannedPoints) * 100).toFixed(1))
          : 0;
      return {
        completionRate,
        inspectedPoints,
        missingPoints,
        plannedPoints,
        [keyName]: key,
      };
    })
    .sort((a, b) => Number(b.missingPoints) - Number(a.missingPoints));
}

export const WorkOrderAggregateService = {
  async getWorkOrderAggregate(workOrderNumber: string) {
    const [workOrder, requirements, inspections] = await Promise.all([
      prisma.work_orders.findFirst({
        where: { isDeleted: false, workOrderNumber },
        select: {
          customerName: true,
          division: true,
          projectName: true,
          quantity: true,
          status: true,
          workOrderNumber: true,
        },
      }),
      WorkOrderRequirementService.findActiveForAggregate(workOrderNumber),
      InspectionService.getWorkOrderAggregateInspections(workOrderNumber),
    ]);
    const byGroup = new Map<string, GroupStats>();
    const requirementList = requirements.map((item) => {
      const partName = normalizeLabel(item.partName);
      const processName = normalizeLabel(resolveCanonicalProcessName(item));
      const plannedPoints = resolveRequirementPoints(item.requirementItems);
      const key = getGroupKey(partName, processName);
      const current = byGroup.get(key) || {
        inspectedPoints: 0,
        partName,
        plannedPoints: 0,
        processName,
      };
      current.plannedPoints += plannedPoints;
      byGroup.set(key, current);
      return {
        attachments: compactAggregateAttachments(
          parseRequirementAttachments(item.attachment),
        ),
        confirmer: item.confirmer || '',
        confirmedAt: item.confirmedAt,
        confirmStatus: String(item.confirmStatus || 'PENDING'),
        createdAt: item.createdAt,
        executed: false,
        executedPoints: 0,
        executionStatus: 'NOT_EXECUTED' as
          | 'CONFIRMED'
          | 'EXECUTED_PENDING_CONFIRM'
          | 'NOT_EXECUTED',
        executor: '-',
        id: item.id,
        partName,
        plannedPoints,
        processName,
        requirementName: String(item.requirementName || '').trim() || '-',
        responsiblePerson: item.responsiblePerson || '',
        responsibleTeam: item.responsibleTeam || '',
        responsibleTeamId: item.responsibleTeamId || '',
        status: 'NOT_EXECUTED' as 'EXECUTED' | 'NOT_EXECUTED',
        workOrderNumber,
      };
    });
    let inspectedPoints = 0;
    const latestInspectorByGroup = new Map<string, string>();
    const inspectionWorksToday: Array<{
      inspector: string;
      partName: string;
      processName: string;
      quantity: number;
      result: string;
      workOrderNumber: string;
    }> = [];
    const processProgressMap = new Map<string, ProcessProgressGroup>();
    const outsourcedProgressRows: Array<{
      inspectionDate: Date;
      materialName: string;
    }> = [];
    const dayRange = getTodayRange();
    for (const inspection of inspections) {
      const partName = normalizeLabel(
        inspection.level2Component || inspection.level1Component,
      );
      const processName = normalizeLabel(
        resolveCanonicalProcessName(inspection),
      );
      const key = getGroupKey(partName, processName);
      const pointCount = Math.max(inspection.items.length, 0);
      inspectedPoints += pointCount;
      const current = byGroup.get(key) || {
        inspectedPoints: 0,
        partName,
        plannedPoints: 0,
        processName,
      };
      current.inspectedPoints += pointCount;
      byGroup.set(key, current);
      latestInspectorByGroup.set(
        key,
        String(inspection.inspector || '').trim() || '-',
      );
      if (
        inspection.inspectionDate >= dayRange.start &&
        inspection.inspectionDate <= dayRange.end
      )
        inspectionWorksToday.push({
          inspector: String(inspection.inspector || '').trim() || '-',
          partName,
          processName,
          quantity: Number(inspection.quantity || 0),
          result: String(inspection.result || ''),
          workOrderNumber,
        });
      if (inspection.category === 'PROCESS') {
        const inspectionQuantity = Math.max(
          1,
          Number(inspection.quantity) || 1,
        );
        const group = processProgressMap.get(partName) || {
          latestDate: inspection.inspectionDate,
          partName,
          processStats: new Map(),
          totalQuantity: 0,
          teams: new Set<string>(),
        };
        if (inspection.inspectionDate > group.latestDate)
          group.latestDate = inspection.inspectionDate;
        const processStat = group.processStats.get(processName) || {
          completedQuantity: 0,
          latestDate: inspection.inspectionDate,
        };
        processStat.completedQuantity += inspectionQuantity;
        if (inspection.inspectionDate > processStat.latestDate)
          processStat.latestDate = inspection.inspectionDate;
        group.processStats.set(processName, processStat);
        group.totalQuantity = Math.max(
          group.totalQuantity,
          processStat.completedQuantity,
        );
        const team = String(inspection.team || '').trim();
        if (team) group.teams.add(team);
        processProgressMap.set(partName, group);
      }
      const incomingType = String(inspection.incomingType || '').trim();
      if (
        inspection.category === 'INCOMING' &&
        (incomingType === '外购件' || incomingType.includes('外购'))
      )
        outsourcedProgressRows.push({
          inspectionDate: inspection.inspectionDate,
          materialName: normalizeLabel(
            inspection.materialName ||
              inspection.level2Component ||
              inspection.level1Component,
          ),
        });
    }
    const partMap = new Map<
      string,
      { inspectedPoints: number; plannedPoints: number }
    >();
    const processMap = new Map<
      string,
      { inspectedPoints: number; plannedPoints: number }
    >();
    const missingDetails: Array<{
      inspectedPoints: number;
      missingPoints: number;
      partName: string;
      plannedPoints: number;
      processName: string;
      status: 'NOT_STARTED' | 'PARTIAL';
    }> = [];
    for (const group of byGroup.values()) {
      const missingPoints = Math.max(
        group.plannedPoints - group.inspectedPoints,
        0,
      );
      const part = partMap.get(group.partName) || {
        inspectedPoints: 0,
        plannedPoints: 0,
      };
      part.plannedPoints += group.plannedPoints;
      part.inspectedPoints += group.inspectedPoints;
      partMap.set(group.partName, part);
      const process = processMap.get(group.processName) || {
        inspectedPoints: 0,
        plannedPoints: 0,
      };
      process.plannedPoints += group.plannedPoints;
      process.inspectedPoints += group.inspectedPoints;
      processMap.set(group.processName, process);
      if (missingPoints > 0)
        missingDetails.push({
          inspectedPoints: group.inspectedPoints,
          missingPoints,
          partName: group.partName,
          plannedPoints: group.plannedPoints,
          processName: group.processName,
          status: group.inspectedPoints > 0 ? 'PARTIAL' : 'NOT_STARTED',
        });
    }
    const plannedPoints = [...byGroup.values()].reduce(
      (sum, item) => sum + item.plannedPoints,
      0,
    );
    const normalizedInspectedPoints = Math.min(
      inspectedPoints,
      plannedPoints || 0,
    );
    const completionRate =
      plannedPoints > 0
        ? Number(((normalizedInspectedPoints / plannedPoints) * 100).toFixed(1))
        : 0;
    const totalParts = partMap.size;
    const checkedParts = [...partMap.values()].filter(
      (item) => item.inspectedPoints > 0,
    ).length;
    const requirementExecutionList = requirementList.map((item) => {
      const group = byGroup.get(getGroupKey(item.partName, item.processName));
      const executedPoints = Number(group?.inspectedPoints || 0);
      const executed = executedPoints > 0;
      let executionStatus:
        | 'CONFIRMED'
        | 'EXECUTED_PENDING_CONFIRM'
        | 'MANUAL_CONFIRMED'
        | 'NOT_EXECUTED' = 'NOT_EXECUTED';
      if (item.confirmStatus === 'CONFIRMED')
        executionStatus = executed ? 'CONFIRMED' : 'MANUAL_CONFIRMED';
      else if (executed) executionStatus = 'EXECUTED_PENDING_CONFIRM';
      return {
        ...item,
        executed,
        executedPoints,
        executionStatus,
        executor:
          latestInspectorByGroup.get(
            getGroupKey(item.partName, item.processName),
          ) || '-',
        status: executed ? ('EXECUTED' as const) : ('NOT_EXECUTED' as const),
      };
    });
    const totalRequirements = requirementExecutionList.length;
    const executedRequirements = requirementExecutionList.filter(
      (item) => item.executed,
    ).length;
    const confirmedRequirements = requirementExecutionList.filter(
      (item) =>
        item.executionStatus === 'CONFIRMED' ||
        item.executionStatus === 'MANUAL_CONFIRMED',
    ).length;
    const pendingConfirmRequirements = requirementExecutionList.filter(
      (item) => item.executionStatus === 'EXECUTED_PENDING_CONFIRM',
    ).length;
    const overdueUnconfirmedRequirements = requirementExecutionList.filter(
      (item) =>
        item.confirmStatus !== 'CONFIRMED' &&
        Date.now() - new Date(item.createdAt).getTime() > 10 * 24 * 3600 * 1000,
    ).length;
    return {
      byPart: mapDimensionStats(partMap, 'partName'),
      byProcess: mapDimensionStats(processMap, 'processName'),
      inspectionWorksToday,
      productionProgress: {
        outsourced: outsourcedProgressRows.map((item, index) => ({
          date: item.inspectionDate,
          id: `${workOrderNumber}-outsourced-${index}`,
          materialName: item.materialName,
        })),
        process: [...processProgressMap.values()]
          .map((item, index) => {
            let coveredQuantity = 0;
            for (const processStat of item.processStats.values())
              coveredQuantity = Math.max(
                coveredQuantity,
                processStat.completedQuantity,
              );
            return {
              coveredQuantity,
              date: item.latestDate,
              id: `${workOrderNumber}-process-${index}`,
              latestDate: item.latestDate,
              partName: item.partName,
              processes: [...item.processStats.entries()]
                .map(([processName, processStat]) => ({
                  completedQuantity: Math.min(
                    processStat.completedQuantity,
                    item.totalQuantity,
                  ),
                  latestDate: processStat.latestDate,
                  processName,
                  status:
                    processStat.completedQuantity >= item.totalQuantity
                      ? ('COMPLETE' as const)
                      : ('PARTIAL' as const),
                  totalQuantity: item.totalQuantity,
                }))
                .sort(
                  (a, b) => b.latestDate.getTime() - a.latestDate.getTime(),
                ),
              teams: [...item.teams],
              totalQuantity: item.totalQuantity,
            };
          })
          .sort((a, b) => b.latestDate.getTime() - a.latestDate.getTime()),
      },
      missingDetails: missingDetails.sort(
        (a, b) => b.missingPoints - a.missingPoints,
      ),
      requirements: requirementExecutionList,
      summary: {
        checkedParts,
        completionRate,
        confirmedRequirements,
        executedRequirements,
        inspectedPoints: normalizedInspectedPoints,
        missingPoints: Math.max(plannedPoints - normalizedInspectedPoints, 0),
        pendingRequirements: Math.max(
          totalRequirements - executedRequirements,
          0,
        ),
        pendingConfirmRequirements,
        plannedPoints,
        plannedRequirements: totalRequirements,
        totalParts,
        overdueUnconfirmedRequirements,
      },
      workOrder: {
        customerName: workOrder?.customerName || '',
        division: workOrder?.division || '',
        projectName: workOrder?.projectName || '',
        quantity: Number(workOrder?.quantity || 0),
        status: workOrder?.status || '',
        workOrderNumber,
      },
    };
  },
};
