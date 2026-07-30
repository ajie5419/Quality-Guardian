import type { Prisma } from '@prisma/client';

import { DeptService } from '~/modules/dept';
import { DictionaryService } from '~/modules/dictionary';
import { PartMasterService } from '~/modules/part-master';
import { ProcessMasterService } from '~/modules/process-master';
import { MasterDataResolutionAuditService } from '~/modules/supplier-identity';
import { TeamIdentityService } from '~/modules/team';
import { BusinessError } from '~/utils/business-error';
import prisma from '~/utils/prisma';

type ResolutionClient = Prisma.TransactionClient;
type SupportedField =
  | 'customerNameId'
  | 'divisionId'
  | 'partId'
  | 'processId'
  | 'projectId'
  | 'requirementId'
  | 'responsibleTeamId';

interface CanonicalValue {
  id: string;
  name: string;
}

function assertSupportedAudit(audit: {
  entityType: string;
  fieldName: string;
  status: string;
}) {
  const workOrderFields = new Set<SupportedField>([
    'customerNameId',
    'divisionId',
    'projectId',
  ]);
  const requirementFields = new Set<SupportedField>([
    'partId',
    'processId',
    'requirementId',
    'responsibleTeamId',
  ]);
  const supported =
    (audit.entityType === 'work_orders' &&
      workOrderFields.has(audit.fieldName as SupportedField)) ||
    (audit.entityType === 'work_order_requirements' &&
      requirementFields.has(audit.fieldName as SupportedField));
  if (audit.status !== 'OPEN' || !supported) {
    throw new BusinessError(
      'MASTER_DATA_REFERENCE_NOT_SUPPORTED',
      'The unresolved reference is not an open work order governance item',
      400,
    );
  }
}

async function resolveDictionary(
  id: string,
  dictType: 'customer_name' | 'requirement_name',
) {
  const options = (await DictionaryService.getOptions(dictType)) as Array<{
    dictKey: string;
    id: string;
  }>;
  const option = options.find((item) => item.id === id.trim());
  if (!option) {
    throw new BusinessError(
      'DICTIONARY_ITEM_NOT_FOUND',
      'Active dictionary item not found',
      404,
    );
  }
  return { id: option.id, name: option.dictKey };
}

async function resolveCanonical(
  fieldName: SupportedField,
  resolvedId: string,
  tx: ResolutionClient,
): Promise<CanonicalValue> {
  if (fieldName === 'divisionId') {
    const department = await DeptService.findActiveById(resolvedId, tx);
    if (!department)
      throw new BusinessError(
        'DEPARTMENT_NOT_FOUND',
        'Active department not found',
        404,
      );
    return department;
  }
  if (fieldName === 'processId') {
    const process = await ProcessMasterService.findActiveById(resolvedId, tx);
    if (!process)
      throw new BusinessError(
        'PROCESS_NOT_FOUND',
        'Active process not found',
        404,
      );
    return process;
  }
  if (fieldName === 'partId') {
    return PartMasterService.assertActive(resolvedId, tx);
  }
  if (fieldName === 'responsibleTeamId') {
    const team = await TeamIdentityService.resolveById(resolvedId);
    if (!team)
      throw new BusinessError('TEAM_NOT_FOUND', 'Active TEAM not found', 404);
    return team;
  }
  if (fieldName === 'customerNameId') {
    return resolveDictionary(resolvedId, 'customer_name');
  }
  if (fieldName === 'requirementId') {
    return resolveDictionary(resolvedId, 'requirement_name');
  }
  const project = await tx.master_projects.findFirst({
    where: { id: resolvedId.trim(), isDeleted: false, status: 1 },
    select: { id: true, name: true },
  });
  if (!project)
    throw new BusinessError(
      'PROJECT_NOT_FOUND',
      'Active project not found',
      404,
    );
  return project;
}

async function updateWorkOrder(
  item: { entityId: string; id: string },
  audit: { fieldName: string; rawId: null | string; rawName: null | string },
  canonical: CanonicalValue,
  tx: ResolutionClient,
) {
  const commonWhere = {
    workOrderNumber: item.entityId,
    isDeleted: false,
  };
  let count = 0;
  switch (audit.fieldName) {
    case 'customerNameId': {
      const result = await tx.work_orders.updateMany({
        where: {
          ...commonWhere,
          customerNameId: audit.rawId,
          customerName: audit.rawName || '',
        },
        data: { customerNameId: canonical.id },
      });
      count = result.count;

      break;
    }
    case 'divisionId': {
      const result = await tx.work_orders.updateMany({
        where: {
          ...commonWhere,
          divisionId: audit.rawId,
          division: audit.rawName,
        },
        data: { divisionId: canonical.id },
      });
      count = result.count;

      break;
    }
    case 'projectId': {
      const result = await tx.work_orders.updateMany({
        where: {
          ...commonWhere,
          projectId: audit.rawId,
          projectName: audit.rawName,
        },
        data: { projectId: canonical.id },
      });
      count = result.count;

      break;
    }
    // No default
  }
  return count === 1 ? item.id : null;
}

async function updateRequirement(
  item: { entityId: string; id: string },
  audit: { fieldName: string; rawId: null | string; rawName: null | string },
  canonical: CanonicalValue,
  tx: ResolutionClient,
) {
  const commonWhere = { id: item.entityId, isDeleted: false };
  let count = 0;
  switch (audit.fieldName) {
    case 'partId': {
      const result = await tx.work_order_requirements.updateMany({
        where: {
          ...commonWhere,
          partId: audit.rawId,
          partName: audit.rawName,
        },
        data: { partId: canonical.id },
      });
      count = result.count;

      break;
    }
    case 'processId': {
      const result = await tx.work_order_requirements.updateMany({
        where: {
          ...commonWhere,
          processId: audit.rawId,
          processName: audit.rawName,
        },
        data: { processId: canonical.id },
      });
      count = result.count;

      break;
    }
    case 'requirementId': {
      const result = await tx.work_order_requirements.updateMany({
        where: {
          ...commonWhere,
          requirementId: audit.rawId,
          requirementName: audit.rawName || '',
        },
        data: { requirementId: canonical.id },
      });
      count = result.count;

      break;
    }
    case 'responsibleTeamId': {
      const result = await tx.work_order_requirements.updateMany({
        where: {
          ...commonWhere,
          responsibleTeamId: audit.rawId,
          responsibleTeam: audit.rawName,
        },
        data: { responsibleTeamId: canonical.id },
      });
      count = result.count;

      break;
    }
    // No default
  }
  return count === 1 ? item.id : null;
}

async function applyBatch(
  audits: Array<{ entityId: string; id: string }>,
  audit: {
    entityType: string;
    fieldName: string;
    rawId: null | string;
    rawName: null | string;
  },
  canonical: CanonicalValue,
  tx: ResolutionClient,
) {
  const applied: string[] = [];
  for (const item of audits) {
    const auditId =
      audit.entityType === 'work_orders'
        ? await updateWorkOrder(item, audit, canonical, tx)
        : await updateRequirement(item, audit, canonical, tx);
    if (auditId) applied.push(auditId);
  }
  return applied;
}

export const WorkOrderGovernanceResolutionService = {
  async resolve(params: { auditId: string; note: string; resolvedId: string }) {
    return prisma.$transaction(
      async (tx) => {
        const audit = await MasterDataResolutionAuditService.get(
          params.auditId,
          tx,
        );
        if (!audit)
          throw new BusinessError(
            'MASTER_DATA_REFERENCE_NOT_FOUND',
            'Unresolved reference not found',
            404,
          );
        assertSupportedAudit(audit);
        const canonical = await resolveCanonical(
          audit.fieldName as SupportedField,
          params.resolvedId,
          tx,
        );
        let affectedCount = 0;
        let afterId: string | undefined;
        let resolvedAuditCount = 0;
        for (;;) {
          const audits =
            await MasterDataResolutionAuditService.findMatchingOpenBatch(
              {
                afterId,
                entityType: audit.entityType,
                fieldName: audit.fieldName,
                rawId: audit.rawId,
                rawName: audit.rawName,
                take: 500,
              },
              tx,
            );
          if (audits.length === 0) break;
          afterId = audits.at(-1)?.id;
          const applied = await applyBatch(audits, audit, canonical, tx);
          if (applied.length === 0) continue;
          const resolved = await MasterDataResolutionAuditService.resolveMany(
            {
              ids: applied,
              note: params.note || 'Resolved from master data governance',
              resolvedId: canonical.id,
            },
            tx,
          );
          if (resolved.count !== applied.length)
            throw new BusinessError(
              'MASTER_DATA_REFERENCE_CHANGED',
              'Work order governance references changed during resolution',
              409,
            );
          affectedCount += applied.length;
          resolvedAuditCount += resolved.count;
        }
        if (affectedCount === 0)
          throw new BusinessError(
            'MASTER_DATA_REFERENCE_CHANGED',
            'Work order data changed after the audit was created',
            409,
          );
        return {
          affectedCount,
          auditId: audit.id,
          canonical,
          resolvedAuditCount,
        };
      },
      { maxWait: 5000, timeout: 60_000 },
    );
  },
};
