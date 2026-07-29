import type { H3Event } from 'h3';
import type { UserSession } from '~/utils/jwt-utils';

import { Prisma } from '@prisma/client';
import { PERMISSION_CODES } from '@qgs/shared';
import { DataScopeService } from '~/modules/data-scope';
import { RbacService } from '~/modules/rbac';
import { recordBusinessAuditLog } from '~/modules/system-log/audit-log';
import { WorkOrderRequirementService } from '~/modules/work-order-requirement/work-order-requirement.service';
import { parseWorkOrderListQuery } from '~/modules/work-order/work-order-query';
import { BusinessError } from '~/utils/business-error';
import { MasterDataGovernanceKernel } from '~/utils/canonical-master-data';
import {
  buildGovernedCanonicalWritePairForTable,
  buildGovernedWriteFieldsForTable,
} from '~/utils/governed-write';
import prisma from '~/utils/prisma';
import { resolveCanonicalProcessName } from '~/utils/process-resolver';

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

function getUserContext(userinfo: UserSession) {
  return {
    userId: String(userinfo.userId ?? userinfo.id ?? ''),
    username: userinfo.username,
  };
}

async function ensureWorkOrderPermission(
  userinfo: UserSession,
  permissionCode: string,
) {
  const { userId } = getUserContext(userinfo);
  const codes = userId ? await RbacService.getUserPermissionCodes(userId) : [];
  if (!codes.includes(permissionCode) && !codes.includes('*')) {
    throw new BusinessError(
      'FORBIDDEN',
      'You do not have permission to modify work order requirements',
      403,
    );
  }
}

async function buildAccessibleWorkOrderWhere(
  event: H3Event,
  userinfo: UserSession,
) {
  const userContext = getUserContext(userinfo);
  const scope =
    event.context.dataScope ??
    (await DataScopeService.getScopeForModule(
      userContext.userId,
      'work-order',
    ));
  if (scope.scopeType === 'SELF' && scope.deptIds.length === 0) {
    throw new BusinessError(
      'FORBIDDEN',
      'Work order requirement mutations require an assigned data scope',
      403,
    );
  }
  return DataScopeService.buildWorkOrderWhere(
    { isDeleted: false },
    userContext,
    scope,
  );
}

function normalizeOptionalText(value: unknown) {
  if (value === undefined) return undefined;
  return String(value || '').trim() || null;
}

function getExpectedConfirmStatus(confirm: boolean | undefined) {
  if (confirm === undefined) return undefined;
  return confirm ? 'PENDING' : 'CONFIRMED';
}

async function resolveV2Identity(
  configKey: 'partName' | 'processName',
  canonicalId: unknown,
) {
  if (canonicalId === undefined) return undefined;
  const id = String(canonicalId || '').trim();
  if (!id) return { id: null, name: null };
  const name = await MasterDataGovernanceKernel.resolveCanonicalNameById({
    canonicalId: id,
    configKey,
    fallbackName: null,
  });
  if (!name) {
    throw new BusinessError(
      'INVALID_CANONICAL_ID',
      `${configKey} identity does not exist or is inactive`,
    );
  }
  return { id, name };
}

function assertV2IdentityContract(body: Record<string, unknown>) {
  if (body.identityContractVersion !== 2) {
    throw new BusinessError(
      'IDENTITY_CONTRACT_V2_REQUIRED',
      'identityContractVersion=2 is required for work order requirement writes',
      400,
    );
  }
}

async function buildRequirementUpdateData(
  body: Record<string, unknown>,
  username: string,
) {
  assertV2IdentityContract(body);
  const [partIdentity, processIdentity] = await Promise.all([
    resolveV2Identity('partName', body.partId),
    resolveV2Identity('processName', body.processId),
  ]);
  const governedFields = buildGovernedWriteFieldsForTable(
    'work_order_requirements',
    {
      partName: partIdentity?.name,
      processName: processIdentity?.name,
      requirementName: body.requirementName,
      responsibleTeam: body.responsibleTeam,
    },
  );
  const canonicalFields = await buildGovernedCanonicalWritePairForTable(
    'work_order_requirements',
    {
      ...governedFields,
      ...(partIdentity ? { partId: partIdentity.id } : {}),
      ...(processIdentity ? { processId: processIdentity.id } : {}),
      responsibleTeamId: body.responsibleTeamId,
    },
  );
  return {
    attachment:
      body.attachments === undefined
        ? undefined
        : JSON.stringify(body.attachments),
    requirementItems:
      body.items === undefined ? undefined : JSON.stringify(body.items),
    requirementName: normalizeOptionalText(body.requirementName),
    responsiblePerson: normalizeOptionalText(body.responsiblePerson),
    ...governedFields,
    ...canonicalFields,
    updatedBy: username,
  } satisfies Prisma.work_order_requirementsUpdateManyMutationInput;
}

export const WorkOrderRequirementRouteService = {
  async createRequirements(
    event: H3Event,
    requirements: Array<Record<string, unknown>>,
    userinfo: UserSession,
  ) {
    await ensureWorkOrderPermission(
      userinfo,
      PERMISSION_CODES.QMS.WORK_ORDER.CREATE,
    );
    requirements.forEach((item) => assertV2IdentityContract(item));
    const normalized = requirements.map((item) => ({
      attachments: JSON.stringify(
        Array.isArray(item.attachments) ? item.attachments : [],
      ),
      items: Array.isArray(item.items) ? item.items : [],
      identityContractVersion: 2,
      partId: String(item.partId || '').trim() || null,
      processId: String(item.processId || '').trim() || null,
      requirementName: String(item.requirementName || '').trim(),
      responsiblePerson: String(item.responsiblePerson || '').trim() || null,
      responsibleTeam: String(item.responsibleTeam || '').trim() || null,
      responsibleTeamId: String(item.responsibleTeamId || '').trim() || null,
      workOrderNumber: String(item.workOrderNumber || '').trim(),
    }));
    const createPayloads = await Promise.all(
      normalized.map(async (item) => {
        const [partIdentity, processIdentity] = await Promise.all([
          resolveV2Identity('partName', item.partId),
          resolveV2Identity('processName', item.processId),
        ]);
        const governedFields = buildGovernedWriteFieldsForTable(
          'work_order_requirements',
          {
            partName: partIdentity?.name,
            processName: processIdentity?.name,
            requirementName: item.requirementName,
            responsibleTeam: item.responsibleTeam,
          },
        );
        return {
          attachment: item.attachments,
          createdBy: userinfo.username,
          requirementItems: JSON.stringify(item.items || []),
          requirementName: item.requirementName,
          responsiblePerson: item.responsiblePerson,
          responsibleTeam: item.responsibleTeam,
          status: 'active',
          updatedBy: userinfo.username,
          workOrderNumber: item.workOrderNumber,
          ...governedFields,
          ...(await buildGovernedCanonicalWritePairForTable(
            'work_order_requirements',
            {
              ...governedFields,
              ...(partIdentity ? { partId: partIdentity.id } : {}),
              ...(processIdentity ? { processId: processIdentity.id } : {}),
              responsibleTeamId: item.responsibleTeamId,
            },
          )),
        };
      }),
    );
    const workOrderNumbers = [
      ...new Set(normalized.map((item) => item.workOrderNumber)),
    ];
    const accessibleWhere = await buildAccessibleWorkOrderWhere(
      event,
      userinfo,
    );
    const created = await prisma.$transaction(async (tx) => {
      const accessibleCount = await tx.work_orders.count({
        where: {
          ...accessibleWhere,
          workOrderNumber: { in: workOrderNumbers },
        },
      });
      if (accessibleCount !== workOrderNumbers.length) {
        throw new BusinessError(
          'FORBIDDEN',
          'One or more work orders are outside your data scope',
          403,
        );
      }
      const createdRequirements = await WorkOrderRequirementService.createMany(
        createPayloads,
        tx,
      );
      await Promise.all(
        createdRequirements.map((item, index) =>
          WorkOrderRequirementService.registerAttachmentReferences({
            attachments: normalized[index]?.attachments,
            bizId: item.id,
            tx,
          }),
        ),
      );
      return createdRequirements;
    });
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
    await ensureWorkOrderPermission(
      userinfo,
      PERMISSION_CODES.QMS.WORK_ORDER.EDIT,
    );
    const workOrderWhere = await buildAccessibleWorkOrderWhere(event, userinfo);
    const confirm =
      typeof body.confirm === 'boolean' ? body.confirm : undefined;
    const data =
      confirm === undefined
        ? await buildRequirementUpdateData(body, userinfo.username)
        : {
            confirmedAt: confirm ? new Date() : null,
            confirmer: confirm ? userinfo.username : null,
            confirmStatus: confirm ? 'CONFIRMED' : 'PENDING',
            updatedBy: userinfo.username,
          };
    const updated = await prisma.$transaction(async (tx) => {
      const result = await WorkOrderRequirementService.updateActiveById(
        {
          data,
          expectedConfirmStatus: getExpectedConfirmStatus(confirm),
          id,
          workOrderWhere,
        },
        tx,
      );
      if (result && body.attachments !== undefined) {
        await WorkOrderRequirementService.registerAttachmentReferences({
          attachments: JSON.stringify(body.attachments),
          bizId: id,
          tx,
        });
      }
      return result;
    });
    if (!updated) {
      const current = await WorkOrderRequirementService.findActiveMutationState(
        id,
        workOrderWhere,
      );
      if (!current) {
        throw new BusinessError('NOT_FOUND', 'Requirement not found', 404);
      }
      throw new BusinessError(
        'STATE_CONFLICT',
        'Requirement confirmation status changed, refresh and try again',
        409,
      );
    }
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
  async deleteRequirement(event: H3Event, id: string, userinfo: UserSession) {
    await ensureWorkOrderPermission(
      userinfo,
      PERMISSION_CODES.QMS.WORK_ORDER.DELETE,
    );
    const workOrderWhere = await buildAccessibleWorkOrderWhere(event, userinfo);
    await prisma.$transaction(async (tx) => {
      const result = await WorkOrderRequirementService.softDeleteById(
        {
          id,
          updatedBy: userinfo.username,
          workOrderWhere,
        },
        tx,
      );
      if (result.count === 0) {
        throw new BusinessError('NOT_FOUND', 'Requirement not found', 404);
      }
      await WorkOrderRequirementService.softDeleteAttachmentReferences(id, tx);
    });
    await recordBusinessAuditLog(event, {
      userId: userinfo.id,
      action: 'DELETE',
      targetType: 'work_order_requirement',
      targetId: id,
      detailsTemplate: 'Delete work order requirement: {{id}}',
      detailsVariables: { id },
    });
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
      partId: item.partId,
      partName: item.partName || '',
      processId: item.processId,
      processName: resolveCanonicalProcessName(item) || '',
      requirementName: item.requirementName || '',
      responsiblePerson: item.responsiblePerson || '',
      responsibleTeam: item.responsibleTeam || '',
      responsibleTeamId: item.responsibleTeamId || '',
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
        partId: item.partId,
        partName: item.partName || '',
        processId: item.processId,
        processName: item.processName || '',
        projectName: item.work_order?.projectName || '',
        requirementName: item.requirementName || '',
        responsiblePerson: item.responsiblePerson || '',
        responsibleTeam: item.responsibleTeam || '',
        responsibleTeamId: item.responsibleTeamId || '',
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
