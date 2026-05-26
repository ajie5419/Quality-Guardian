import type { H3Event } from 'h3';
import type { UserSession } from '~/utils/jwt-utils';

import {
  buildGovernedCanonicalWritePairForTable,
  buildGovernedWriteFieldsForTable,
} from '~/governance/master-data/master-data-governance-write';
import { resolveCanonicalProcessName } from '~/governance/master-data/process-resolver';
import { recordBusinessAuditLog } from '~/modules/system-log/audit-log';
import { WorkOrderRequirementService } from '~/modules/work-order-requirement/work-order-requirement.service';
import { parseWorkOrderListQuery } from '~/modules/work-order/work-order-query';

import { WorkOrderAggregateService } from './work-order-aggregate.service';
import { parseRequirementAttachments } from './work-order-requirement-attachments';

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

export const WorkOrderRequirementRouteService = {
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
    return WorkOrderAggregateService.getWorkOrderAggregate(workOrderNumber);
  },
};
