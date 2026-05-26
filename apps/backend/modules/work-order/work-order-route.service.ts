import type { H3Event } from 'h3';
import type { ImportRowError } from '~/utils/import-report';
import type { UserSession } from '~/utils/jwt-utils';

import { InspectionService } from '~/modules/inspection';
import { WorkOrderRequirementService } from '~/modules/work-order-requirement/work-order-requirement.service';
import { WorkOrderService } from '~/modules/work-order/work-order.service';
import { logApiError } from '~/utils/api-logger';
import { recordBusinessAuditLog } from '~/utils/audit-log';
import { BusinessError } from '~/utils/business-error';
import {
  buildImportRowError,
  buildImportSummary,
  inferImportErrorField,
  toImportErrorMessage,
} from '~/utils/import-report';
import {
  buildGovernedCanonicalWritePairForTable,
  buildGovernedWriteFieldsForTable,
} from '~/utils/master-data-governance-write';
import prisma from '~/utils/prisma';
import {
  isPrismaNotFoundError,
  isPrismaRequiredValueError,
  isPrismaUniqueConflictError,
} from '~/utils/prisma-error';
import { resolveCanonicalProcessName } from '~/utils/process-resolver';
import {
  parseOptionalDate,
  parseRequiredDate,
  parseRequiredWorkOrderNumber,
  parseWorkOrderListQuery,
  parseWorkOrderQuantity,
} from '~/utils/work-order';

import { parseRequirementAttachments } from './work-order-requirement-attachments';
import { mapWorkOrderStatus } from './work-order-status';

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

export const WorkOrderRouteService = {
  async batchDelete(event: H3Event, ids: string[], userinfo: UserSession) {
    const result = await prisma.work_orders.updateMany({
      where: { workOrderNumber: { in: ids }, isDeleted: false },
      data: { isDeleted: true, updatedAt: new Date() },
    });
    await recordBusinessAuditLog(event, {
      userId: userinfo.id,
      action: 'DELETE',
      targetType: 'work_order',
      targetId: ids.join(','),
      detailsTemplate: '批量删除工单: {{count}} 条',
      detailsVariables: { count: result.count },
    });
    return { successCount: result.count };
  },
  async deleteById(event: H3Event, id: string, userinfo: UserSession) {
    try {
      const deleted = await prisma.work_orders.update({
        where: { workOrderNumber: id },
        data: { isDeleted: true, updatedAt: new Date() },
      });
      await recordBusinessAuditLog(event, {
        userId: userinfo.id,
        action: 'DELETE',
        targetType: 'work_order',
        targetId: String(id),
        detailsTemplate: '删除工单: {{workOrderNumber}} ({{customerName}})',
        detailsVariables: {
          customerName: deleted.customerName,
          workOrderNumber: deleted.workOrderNumber,
        },
      });
      return null;
    } catch (error) {
      if (isPrismaNotFoundError(error)) {
        throw new BusinessError('NOT_FOUND', '工单不存在', 404);
      }
      throw error;
    }
  },
  async create(
    event: H3Event,
    body: Record<string, unknown>,
    userinfo: UserSession,
  ) {
    const woNum = parseRequiredWorkOrderNumber(body.workOrderNumber);
    if (!woNum || !body.customerName)
      throw new Error('BAD_REQUEST:缺少必填字段');
    const existing = await prisma.work_orders.findUnique({
      where: { workOrderNumber: woNum },
    });
    if (existing)
      throw new Error(`CONFLICT:工单号 ${woNum} 已存在，请使用其他编号`);
    const governedFields = buildGovernedWriteFieldsForTable('work_orders', {
      customerName: body.customerName,
      division: body.division,
    });
    try {
      const newWO = await prisma.work_orders.create({
        data: {
          workOrderNumber: woNum,
          customerName: body.customerName as string,
          projectName: body.projectName as string | undefined,
          ...governedFields,
          quantity: parseWorkOrderQuantity(body.quantity, 1),
          deliveryDate: parseRequiredDate(body.deliveryDate),
          effectiveTime: parseOptionalDate(body.effectiveTime),
          status: mapWorkOrderStatus(body.status),
          isDeleted: false,
          updatedAt: new Date(),
        },
      });
      await recordBusinessAuditLog(event, {
        userId: userinfo.id,
        action: 'CREATE',
        targetType: 'work_order',
        targetId: String(newWO.workOrderNumber),
        detailsTemplate: '新增工单: {{workOrderNumber}} ({{customerName}})',
        detailsVariables: {
          customerName: newWO.customerName,
          workOrderNumber: newWO.workOrderNumber,
        },
      });
      return {
        ...newWO,
        id: newWO.workOrderNumber,
        createTime: newWO.createdAt
          .toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
          })
          .replaceAll('/', '-'),
      };
    } catch (error) {
      if (isPrismaUniqueConflictError(error))
        throw new Error('CONFLICT:工单号已存在，请使用其他编号');
      if (isPrismaRequiredValueError(error))
        throw new Error('BAD_REQUEST:请求参数错误');
      throw error;
    }
  },
  async update(
    event: H3Event,
    id: string,
    body: Record<string, unknown>,
    userinfo: UserSession,
  ) {
    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (body.customerName !== undefined)
      Object.assign(
        updateData,
        buildGovernedWriteFieldsForTable('work_orders', {
          customerName: body.customerName,
        }),
      );
    if (body.division !== undefined)
      Object.assign(
        updateData,
        buildGovernedWriteFieldsForTable('work_orders', {
          division: body.division,
        }),
      );
    if (body.projectName !== undefined)
      updateData.projectName = body.projectName;
    if (body.quantity !== undefined && body.quantity !== null)
      updateData.quantity = parseWorkOrderQuantity(body.quantity, 1);
    if (body.deliveryDate !== undefined && body.deliveryDate !== null)
      updateData.deliveryDate = parseRequiredDate(body.deliveryDate);
    if (body.effectiveTime !== undefined)
      updateData.effectiveTime = parseOptionalDate(body.effectiveTime);
    if (body.workOrderNumber && body.workOrderNumber !== id)
      updateData.workOrderNumber = body.workOrderNumber;
    if (body.status) updateData.status = mapWorkOrderStatus(body.status);
    try {
      const updated = await prisma.work_orders.update({
        where: { workOrderNumber: id },
        data: updateData,
      });
      await recordBusinessAuditLog(event, {
        userId: userinfo.id,
        action: 'UPDATE',
        targetType: 'work_order',
        targetId: String(id),
        detailsTemplate: '修改工单: {{workOrderNumber}} ({{customerName}})',
        detailsVariables: {
          customerName: updated.customerName,
          workOrderNumber: updated.workOrderNumber,
        },
      });
      return null;
    } catch (error) {
      if (isPrismaNotFoundError(error))
        throw new BusinessError('NOT_FOUND', `工单不存在: ${id}`, 404);
      throw error;
    }
  },
  async importRows(
    event: H3Event,
    items: Array<Record<string, unknown>>,
    userinfo: UserSession,
  ) {
    let successCount = 0;
    const rowErrors: ImportRowError[] = [];
    for (const [index, item] of items.entries()) {
      try {
        const woNumber = parseRequiredWorkOrderNumber(item.workOrderNumber);
        if (!woNumber) {
          rowErrors.push(
            buildImportRowError({
              field: 'workOrderNumber',
              item,
              keyField: 'workOrderNumber',
              reason: '工单号为空',
              row: index + 1,
              suggestion: '请填写有效工单号',
            }),
          );
          continue;
        }
        await prisma.work_orders.upsert({
          where: { workOrderNumber: woNumber },
          update: {
            customerName: item.customerName
              ? String(item.customerName)
              : undefined,
            projectName: item.projectName
              ? String(item.projectName)
              : undefined,
            ...buildGovernedWriteFieldsForTable('work_orders', {
              customerName: item.customerName,
              division: item.division,
            }),
            quantity:
              item.quantity !== undefined && item.quantity !== null
                ? parseWorkOrderQuantity(item.quantity, 1)
                : undefined,
            deliveryDate: parseRequiredDate(item.deliveryDate),
            effectiveTime: parseOptionalDate(item.effectiveTime),
            status: mapWorkOrderStatus(item.status),
            isDeleted: false,
          },
          create: {
            workOrderNumber: woNumber,
            customerName: String(item.customerName || '未知客户'),
            projectName: String(item.projectName || ''),
            ...buildGovernedWriteFieldsForTable('work_orders', {
              customerName: item.customerName,
              division: item.division,
            }),
            quantity: parseWorkOrderQuantity(item.quantity, 1),
            deliveryDate: parseRequiredDate(item.deliveryDate),
            effectiveTime: parseOptionalDate(item.effectiveTime),
            status: mapWorkOrderStatus(item.status),
          },
        });
        successCount++;
      } catch (error) {
        logApiError('import', error, undefined, event);
        const message = toImportErrorMessage(error);
        rowErrors.push(
          buildImportRowError({
            field: inferImportErrorField(message),
            item,
            keyField: 'workOrderNumber',
            reason: message,
            row: index + 1,
          }),
        );
      }
    }
    await recordBusinessAuditLog(event, {
      userId: userinfo.id,
      action: 'CREATE',
      targetType: 'work_order',
      targetId: 'batch-import',
      detailsTemplate: '导入工单: {{successCount}}/{{totalCount}} 条',
      detailsVariables: { successCount, totalCount: items.length },
    });
    return buildImportSummary({
      rowErrors,
      successCount,
      totalCount: items.length,
    });
  },
  async createRequirements(
    event: H3Event,
    requirements: Array<Record<string, unknown>>,
    userinfo: UserSession,
  ) {
    const normalized = requirements.map((item) => ({
      attachments: JSON.stringify(
        Array.isArray(item.attachments) ? item.attachments : [],
      ),
      items: Array.isArray(item.items) ? item.items : [],
      partName: String(item.partName || '').trim() || null,
      processName: String(item.processName || '').trim() || null,
      requirementName: String(item.requirementName || '').trim(),
      responsiblePerson: String(item.responsiblePerson || '').trim() || null,
      responsibleTeam: String(item.responsibleTeam || '').trim() || null,
      workOrderNumber: String(item.workOrderNumber || '').trim(),
    }));
    const createPayloads = await Promise.all(
      normalized.map(async (item) => ({
        attachment: item.attachments,
        createdBy: userinfo.username,
        ...buildGovernedWriteFieldsForTable('work_order_requirements', {
          partName: item.partName,
          processName: item.processName,
          requirementName: item.requirementName,
          responsibleTeam: item.responsibleTeam,
        }),
        ...(await buildGovernedCanonicalWritePairForTable(
          'work_order_requirements',
          {
            partName: item.partName,
            processName: item.processName,
            requirementName: item.requirementName,
            responsibleTeam: item.responsibleTeam,
          },
        )),
        requirementItems: JSON.stringify(item.items || []),
        requirementName: item.requirementName,
        responsiblePerson: item.responsiblePerson,
        responsibleTeam: item.responsibleTeam,
        status: 'active',
        updatedBy: userinfo.username,
        workOrderNumber: item.workOrderNumber,
      })),
    );
    const created =
      await WorkOrderRequirementService.createMany(createPayloads);
    await Promise.all(
      created.map((item, index) =>
        WorkOrderRequirementService.registerAttachmentReferences({
          attachments: normalized[index]?.attachments,
          bizId: item.id,
        }),
      ),
    );
    await recordBusinessAuditLog(event, {
      userId: userinfo.id,
      action: 'CREATE',
      targetType: 'work_order_requirement',
      targetId: created.map((item) => item.id).join(','),
      detailsTemplate: '新增工单要求: {{count}} 条',
      detailsVariables: { count: created.length },
    });
    return { items: created, success: true };
  },
  async updateRequirement(
    event: H3Event,
    id: string,
    body: Record<string, unknown>,
    userinfo: UserSession,
  ) {
    const confirm = Boolean(body.confirm);
    const governedFields = buildGovernedWriteFieldsForTable(
      'work_order_requirements',
      {
        requirementName:
          body.requirementName === undefined
            ? undefined
            : String(body.requirementName || '').trim() || null,
        responsibleTeam:
          body.responsibleTeam === undefined
            ? undefined
            : String(body.responsibleTeam || '').trim() || null,
      },
    );
    const governedCanonicalIds = await buildGovernedCanonicalWritePairForTable(
      'work_order_requirements',
      governedFields as Record<string, unknown>,
    );
    const updated = await WorkOrderRequirementService.updateById(id, {
      confirmedAt: confirm ? new Date() : null,
      confirmer: confirm ? userinfo.username : null,
      confirmStatus: confirm ? 'CONFIRMED' : 'PENDING',
      requirementName:
        body.requirementName === undefined
          ? undefined
          : String(body.requirementName || '').trim(),
      responsiblePerson:
        body.responsiblePerson === undefined
          ? undefined
          : String(body.responsiblePerson || '').trim() || null,
      ...governedFields,
      ...governedCanonicalIds,
      updatedBy: userinfo.username,
    });
    await recordBusinessAuditLog(event, {
      userId: userinfo.id,
      action: 'UPDATE',
      targetType: 'work_order_requirement',
      targetId: String(updated.id),
      detailsTemplate:
        '更新工单要求: {{workOrderNumber}} - {{requirementName}}',
      detailsVariables: {
        requirementName: updated.requirementName,
        workOrderNumber: updated.workOrderNumber,
      },
    });
    return updated;
  },
  async getRequirements(workOrderNumber: string) {
    const list =
      await WorkOrderRequirementService.findActiveByWorkOrder(workOrderNumber);
    return list.map((item) => ({
      attachments: parseRequirementAttachments(item.attachment),
      confirmer: item.confirmer || '',
      confirmedAt: item.confirmedAt,
      confirmStatus: item.confirmStatus || 'PENDING',
      createdAt: item.createdAt,
      id: item.id,
      items: parseRequirementItems(item.requirementItems),
      partName: item.partName || '',
      processName: resolveCanonicalProcessName(item) || '',
      requirementName: item.requirementName || '',
      responsiblePerson: item.responsiblePerson || '',
      responsibleTeam: item.responsibleTeam || '',
      workOrderNumber: item.workOrderNumber,
    }));
  },
  async exportList(
    event: H3Event,
    query: Record<string, unknown>,
    userinfo: UserSession,
  ) {
    const MAX_EXPORT_ROWS = 20_000;
    const params = parseWorkOrderListQuery(query);
    const result = await WorkOrderService.getList({
      ...params,
      page: 1,
      pageSize: MAX_EXPORT_ROWS + 1,
    });
    if ((result.total || 0) > MAX_EXPORT_ROWS)
      throw new Error(
        `BAD_REQUEST:导出数据量超过上限（${MAX_EXPORT_ROWS} 条），请缩小筛选范围后重试`,
      );
    await recordBusinessAuditLog(event, {
      userId: userinfo.id,
      action: 'EXPORT',
      targetType: 'work_order',
      targetId: 'export',
      detailsTemplate: '导出工单: {{count}} 条',
      detailsVariables: { count: result.total || 0 },
    });
    return { items: result.items || [], total: result.total || 0 };
  },
  async getRequirementBoard(
    query: Record<string, unknown>,
    userinfo: UserSession,
  ) {
    const params = parseWorkOrderListQuery(query);
    const normalized = String(query.filter || 'all')
      .trim()
      .toLowerCase();
    const filter =
      normalized === 'confirmed' ||
      normalized === 'pending' ||
      normalized === 'overdue'
        ? normalized
        : 'all';
    const result = await WorkOrderRequirementService.getRequirementBoard({
      ...params,
      filter,
      userContext: {
        userId: String(userinfo.id || userinfo.userId || ''),
        username: userinfo.username,
      },
    });
    return {
      items: result.items.map((item) => ({
        attachments: parseRequirementAttachments(item.attachment),
        confirmedAt: item.confirmedAt,
        confirmer: item.confirmer || '',
        confirmStatus: String(item.confirmStatus || 'PENDING').toUpperCase(),
        createdAt: item.createdAt,
        customerName: item.work_order?.customerName || '',
        division: item.work_order?.division || '',
        id: item.id,
        partName: item.partName || '',
        processName: item.processName || '',
        projectName: item.work_order?.projectName || '',
        requirementName: item.requirementName || '',
        responsiblePerson: item.responsiblePerson || '',
        responsibleTeam: item.responsibleTeam || '',
        workOrderNumber: item.workOrderNumber,
        workOrderStatus: item.work_order?.status || '',
      })),
      total: result.total,
    };
  },
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
