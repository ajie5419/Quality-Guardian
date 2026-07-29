import type { IdentityResolutionStatus } from '@qgs/shared';

import type {
  AggregateIdentity,
  DimensionStats,
} from './work-order-aggregate-identity';

import { InspectionService } from '~/modules/inspection';
import { WorkOrderRequirementService } from '~/modules/work-order-requirement/work-order-requirement.service';
import { MasterDataGovernanceKernel } from '~/utils/canonical-master-data';
import prisma from '~/utils/prisma';
import { resolveCanonicalProcessName } from '~/utils/process-resolver';

import {
  getAggregateGroupKey,
  getAggregateIdentityKey,
  mapAggregateDimensionStats,
  normalizeAggregateLabel,
  resolveAggregateIdentity,
} from './work-order-aggregate-identity';
import { parseRequirementAttachments } from './work-order-requirement-attachments';

type GroupStats = {
  inspectedPoints: number;
  part: AggregateIdentity;
  plannedPoints: number;
  process: AggregateIdentity;
};
type AggregateAttachment = { name?: string; type?: string; url: string };
type ProcessProgressGroup = {
  latestDate: Date;
  part: AggregateIdentity;
  processStats: Map<
    string,
    {
      completedQuantity: number;
      latestDate: Date;
      process: AggregateIdentity;
    }
  >;
  teams: Map<string, AggregateIdentity>;
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
    const [partNames, processNames, teamNames] = await Promise.all([
      MasterDataGovernanceKernel.resolveCanonicalNamesByIds({
        canonicalIds: [
          ...requirements.map((item) => item.partId),
          ...inspections.map((item) => item.partId),
        ],
        configKey: 'partName',
      }),
      MasterDataGovernanceKernel.resolveCanonicalNamesByIds({
        canonicalIds: [
          ...requirements.map((item) => item.processId),
          ...inspections.map((item) => item.processId),
        ],
        configKey: 'processName',
      }),
      MasterDataGovernanceKernel.resolveCanonicalNamesByIds({
        canonicalIds: inspections.map((item) => item.teamId),
        configKey: 'team',
      }),
    ]);
    const byGroup = new Map<string, GroupStats>();
    const requirementList = requirements.map((item) => {
      const part = resolveAggregateIdentity({
        canonicalNames: partNames,
        id: item.partId,
        snapshot: item.partName,
      });
      const process = resolveAggregateIdentity({
        canonicalNames: processNames,
        id: item.processId,
        snapshot: resolveCanonicalProcessName(item),
      });
      const plannedPoints = resolveRequirementPoints(item.requirementItems);
      const groupKey = getAggregateGroupKey(
        part.id,
        process.id,
        `requirement:${item.id}`,
      );
      const current = byGroup.get(groupKey) || {
        inspectedPoints: 0,
        part,
        plannedPoints: 0,
        process,
      };
      current.plannedPoints += plannedPoints;
      byGroup.set(groupKey, current);
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
        items: parseRequirementItems(item.requirementItems),
        groupKey,
        partId: part.id,
        partName: part.name,
        partResolutionStatus: part.resolutionStatus,
        plannedPoints,
        processId: process.id,
        processName: process.name,
        processResolutionStatus: process.resolutionStatus,
        requirementName: String(item.requirementName || '').trim() || '-',
        responsiblePerson: item.responsiblePerson || '',
        responsibleTeam: item.responsibleTeam || '',
        responsibleTeamId: item.responsibleTeamId || '',
        status: 'NOT_EXECUTED' as 'EXECUTED' | 'NOT_EXECUTED',
        workOrderNumber,
      };
    });
    const latestInspectorByGroup = new Map<string, string>();
    const inspectionWorksToday: Array<{
      inspector: string;
      partId: null | string;
      partName: string;
      partResolutionStatus: IdentityResolutionStatus;
      processId: null | string;
      processName: string;
      processResolutionStatus: IdentityResolutionStatus;
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
    let observedInspectedPoints = 0;
    for (const inspection of inspections) {
      const part = resolveAggregateIdentity({
        canonicalNames: partNames,
        id: inspection.partId,
        snapshot:
          inspection.materialName ||
          inspection.level2Component ||
          inspection.level1Component,
      });
      const process = resolveAggregateIdentity({
        canonicalNames: processNames,
        id: inspection.processId,
        snapshot: resolveCanonicalProcessName(inspection),
      });
      const key = getAggregateGroupKey(
        part.id,
        process.id,
        `inspection:${inspection.id}`,
      );
      const pointCount = Math.max(inspection.items.length, 0);
      observedInspectedPoints += pointCount;
      const current = byGroup.get(key) || {
        inspectedPoints: 0,
        part,
        plannedPoints: 0,
        process,
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
          partId: part.id,
          partName: part.name,
          partResolutionStatus: part.resolutionStatus,
          processId: process.id,
          processName: process.name,
          processResolutionStatus: process.resolutionStatus,
          quantity: Number(inspection.quantity || 0),
          result: String(inspection.result || ''),
          workOrderNumber,
        });
      if (inspection.category === 'PROCESS') {
        const inspectionQuantity = Math.max(
          1,
          Number(inspection.quantity) || 1,
        );
        const partKey = getAggregateIdentityKey(
          part.id,
          `inspection:${inspection.id}:part`,
        );
        const group = processProgressMap.get(partKey) || {
          latestDate: inspection.inspectionDate,
          part,
          processStats: new Map(),
          totalQuantity: 0,
          teams: new Map(),
        };
        if (inspection.inspectionDate > group.latestDate)
          group.latestDate = inspection.inspectionDate;
        const processKey = getAggregateIdentityKey(
          process.id,
          `inspection:${inspection.id}:process`,
        );
        const processStat = group.processStats.get(processKey) || {
          completedQuantity: 0,
          latestDate: inspection.inspectionDate,
          process,
        };
        processStat.completedQuantity += inspectionQuantity;
        if (inspection.inspectionDate > processStat.latestDate)
          processStat.latestDate = inspection.inspectionDate;
        group.processStats.set(processKey, processStat);
        group.totalQuantity = Math.max(
          group.totalQuantity,
          processStat.completedQuantity,
        );
        const team = resolveAggregateIdentity({
          canonicalNames: teamNames,
          id: inspection.teamId,
          snapshot: inspection.team,
        });
        group.teams.set(
          getAggregateIdentityKey(team.id, `inspection:${inspection.id}:team`),
          team,
        );
        processProgressMap.set(partKey, group);
      }
      const incomingType = String(inspection.incomingType || '').trim();
      if (
        inspection.category === 'INCOMING' &&
        (incomingType === '外购件' || incomingType.includes('外购'))
      )
        outsourcedProgressRows.push({
          inspectionDate: inspection.inspectionDate,
          materialName: normalizeAggregateLabel(
            inspection.materialName ||
              inspection.level2Component ||
              inspection.level1Component,
          ),
        });
    }
    const partMap = new Map<string, DimensionStats>();
    const processMap = new Map<string, DimensionStats>();
    const missingDetails: Array<{
      inspectedPoints: number;
      missingPoints: number;
      partId: null | string;
      partName: string;
      partResolutionStatus: IdentityResolutionStatus;
      plannedPoints: number;
      processId: null | string;
      processName: string;
      processResolutionStatus: IdentityResolutionStatus;
      status: 'NOT_STARTED' | 'PARTIAL';
    }> = [];
    for (const [groupKey, group] of byGroup.entries()) {
      const missingPoints = Math.max(
        group.plannedPoints - group.inspectedPoints,
        0,
      );
      const partKey = getAggregateIdentityKey(
        group.part.id,
        `${groupKey}:part`,
      );
      const part = partMap.get(partKey) || {
        identity: group.part,
        inspectedPoints: 0,
        plannedPoints: 0,
      };
      part.plannedPoints += group.plannedPoints;
      part.inspectedPoints += group.inspectedPoints;
      partMap.set(partKey, part);
      const processKey = getAggregateIdentityKey(
        group.process.id,
        `${groupKey}:process`,
      );
      const process = processMap.get(processKey) || {
        identity: group.process,
        inspectedPoints: 0,
        plannedPoints: 0,
      };
      process.plannedPoints += group.plannedPoints;
      process.inspectedPoints += group.inspectedPoints;
      processMap.set(processKey, process);
      if (missingPoints > 0)
        missingDetails.push({
          inspectedPoints: group.inspectedPoints,
          missingPoints,
          partId: group.part.id,
          partName: group.part.name,
          partResolutionStatus: group.part.resolutionStatus,
          plannedPoints: group.plannedPoints,
          processId: group.process.id,
          processName: group.process.name,
          processResolutionStatus: group.process.resolutionStatus,
          status: group.inspectedPoints > 0 ? 'PARTIAL' : 'NOT_STARTED',
        });
    }
    const plannedPoints = [...byGroup.values()].reduce(
      (sum, item) => sum + item.plannedPoints,
      0,
    );
    const normalizedInspectedPoints = [...byGroup.values()].reduce(
      (sum, item) =>
        sum + Math.min(item.inspectedPoints, item.plannedPoints || 0),
      0,
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
      const group = byGroup.get(item.groupKey);
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
        executor: latestInspectorByGroup.get(item.groupKey) || '-',
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
      byPart: mapAggregateDimensionStats(partMap, 'part'),
      byProcess: mapAggregateDimensionStats(processMap, 'process'),
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
              partId: item.part.id,
              partName: item.part.name,
              partResolutionStatus: item.part.resolutionStatus,
              processes: [...item.processStats.entries()]
                .map(([, processStat]) => ({
                  completedQuantity: Math.min(
                    processStat.completedQuantity,
                    item.totalQuantity,
                  ),
                  latestDate: processStat.latestDate,
                  processId: processStat.process.id,
                  processName: processStat.process.name,
                  processResolutionStatus: processStat.process.resolutionStatus,
                  status:
                    processStat.completedQuantity >= item.totalQuantity
                      ? ('COMPLETE' as const)
                      : ('PARTIAL' as const),
                  totalQuantity: item.totalQuantity,
                }))
                .sort(
                  (a, b) => b.latestDate.getTime() - a.latestDate.getTime(),
                ),
              teams: [...item.teams.values()],
              totalQuantity: item.totalQuantity,
            };
          })
          .sort((a, b) => b.latestDate.getTime() - a.latestDate.getTime()),
      },
      missingDetails: missingDetails.sort(
        (a, b) => b.missingPoints - a.missingPoints,
      ),
      requirements: requirementExecutionList.map(
        ({ groupKey: _groupKey, ...item }) => item,
      ),
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
        unattributedInspectedPoints: Math.max(
          observedInspectedPoints - normalizedInspectedPoints,
          0,
        ),
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
