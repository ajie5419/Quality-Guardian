import type { Prisma } from '@prisma/client';

import {
  MasterDataResolutionAuditService,
  SupplierIdentityService,
} from '~/modules/supplier-identity';
import { BusinessError } from '~/utils/business-error';
import { MasterDataGovernanceKernel } from '~/utils/canonical-master-data';
import prisma from '~/utils/prisma';

const FIELD_CONFIG = {
  incomingTypeId: { configKey: 'incomingType', nameField: 'incomingType' },
  materialNameId: { configKey: 'materialName', nameField: 'materialName' },
  partId: { configKey: 'partName', nameField: 'partName' },
  processId: { configKey: 'processName', nameField: 'processName' },
  projectId: { configKey: 'projectName', nameField: 'projectName' },
  supplierId: { configKey: 'supplierName', nameField: 'supplierName' },
  teamId: { configKey: 'team', nameField: 'team' },
} as const;

type SupportedField = keyof typeof FIELD_CONFIG;
type InspectionTx = Pick<
  Prisma.TransactionClient,
  | '$queryRaw'
  | 'inspections'
  | 'supplier_identity_links'
  | 'team_identity_merge_participants'
>;

function supportedField(fieldName: string): null | SupportedField {
  return Object.prototype.hasOwnProperty.call(FIELD_CONFIG, fieldName)
    ? (fieldName as SupportedField)
    : null;
}

async function assertSelection(field: SupportedField, canonicalId: string) {
  const names = await MasterDataGovernanceKernel.resolveCanonicalNamesByIds({
    canonicalIds: [canonicalId],
    configKey: FIELD_CONFIG[field].configKey,
  });
  const name = String(names.get(canonicalId) || '').trim();
  if (!name) {
    throw new BusinessError(
      'INVALID_CANONICAL_ID',
      'The selected master data is not active',
      400,
    );
  }
  return { id: canonicalId, name };
}

function sourceWhere(
  field: SupportedField,
  audit: { rawId: null | string; rawName: null | string },
) {
  const name = audit.rawName || '';
  switch (field) {
    case 'incomingTypeId': {
      return { incomingType: name, incomingTypeId: audit.rawId };
    }
    case 'materialNameId': {
      return { materialName: name, materialNameId: audit.rawId };
    }
    case 'partId': {
      return { partId: audit.rawId, partName: name };
    }
    case 'processId': {
      return { processId: audit.rawId, processName: name };
    }
    case 'projectId': {
      return { projectId: audit.rawId, projectName: name };
    }
    case 'supplierId': {
      return { supplierId: audit.rawId, supplierName: name };
    }
    case 'teamId': {
      return { team: name, teamId: audit.rawId };
    }
  }
}

function targetData(
  field: SupportedField,
  selection: { id: string; name: string },
) {
  switch (field) {
    case 'incomingTypeId': {
      return { incomingTypeId: selection.id };
    }
    case 'materialNameId': {
      return { materialNameId: selection.id };
    }
    case 'partId': {
      return { partId: selection.id };
    }
    case 'processId': {
      return { processId: selection.id };
    }
    case 'projectId': {
      return { projectId: selection.id };
    }
    case 'supplierId': {
      return { supplierId: selection.id };
    }
    case 'teamId': {
      return { teamId: selection.id };
    }
  }
}

async function assertSupplierConsistency(
  tx: InspectionTx,
  ids: string[],
  supplierId: string,
) {
  const processRows = await tx.inspections.findMany({
    where: { category: 'PROCESS', id: { in: ids }, isDeleted: false },
    select: { id: true, teamId: true },
  });
  if (processRows.some((row) => !row.teamId)) {
    throw new BusinessError(
      'SUPPLIER_TEAM_CONFLICT',
      'The selected supplier requires an inspection TEAM',
      409,
    );
  }
  const teamIds = [
    ...new Set(processRows.map((row) => String(row.teamId))),
  ].sort();
  for (const teamId of teamIds) {
    await SupplierIdentityService.lockTeamForMutation(teamId, tx);
  }
  for (const row of processRows) {
    const linked = await SupplierIdentityService.resolveSupplierByTeamId(
      row.teamId,
      tx,
    );
    if (!linked || linked.id !== supplierId) {
      throw new BusinessError(
        'SUPPLIER_TEAM_CONFLICT',
        'The selected supplier does not match the inspection TEAM',
        409,
      );
    }
  }
}

export const InspectionIdentityResolutionService = {
  async resolve(params: {
    auditId: string;
    canonicalId: string;
    note: string;
  }) {
    return prisma.$transaction(
      async (tx) => {
        const audit = await MasterDataResolutionAuditService.get(
          params.auditId,
          tx,
        );
        const field = audit ? supportedField(audit.fieldName) : null;
        if (!audit) {
          throw new BusinessError(
            'MASTER_DATA_REFERENCE_NOT_FOUND',
            'Unresolved reference not found',
            404,
          );
        }
        if (
          audit.status !== 'OPEN' ||
          audit.entityType !== 'inspections' ||
          !field
        ) {
          throw new BusinessError(
            'MASTER_DATA_REFERENCE_NOT_SUPPORTED',
            'The unresolved inspection reference is not supported',
            400,
          );
        }
        const selection = await assertSelection(field, params.canonicalId);
        let affectedCount = 0;
        let afterId: string | undefined;
        let resolvedAuditCount = 0;
        for (;;) {
          const matches =
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
          if (matches.length === 0) break;
          afterId = matches.at(-1)?.id;
          const eligible = await tx.inspections.findMany({
            where: {
              id: { in: matches.map((item) => item.entityId) },
              isDeleted: false,
              ...sourceWhere(field, audit),
            },
            select: { id: true },
          });
          const eligibleIds = new Set(eligible.map((item) => item.id));
          const eligibleAudits = matches.filter((item) =>
            eligibleIds.has(item.entityId),
          );
          if (eligibleAudits.length === 0) continue;
          const entityIds = eligibleAudits.map((item) => item.entityId);
          if (field === 'supplierId') {
            await assertSupplierConsistency(tx, entityIds, selection.id);
          }
          const updated = await tx.inspections.updateMany({
            where: {
              id: { in: entityIds },
              isDeleted: false,
              ...sourceWhere(field, audit),
            },
            data: targetData(field, selection),
          });
          if (updated.count !== eligibleAudits.length) {
            throw new BusinessError(
              'MASTER_DATA_REFERENCE_CHANGED',
              'Inspection identity changed during resolution',
              409,
            );
          }
          const resolved = await MasterDataResolutionAuditService.resolveMany(
            {
              ids: eligibleAudits.map((item) => item.id),
              note: params.note || 'Resolved from master data governance',
              resolvedId: selection.id,
            },
            tx,
          );
          if (resolved.count !== eligibleAudits.length) {
            throw new BusinessError(
              'MASTER_DATA_REFERENCE_CHANGED',
              'Inspection governance references changed during resolution',
              409,
            );
          }
          affectedCount += updated.count;
          resolvedAuditCount += resolved.count;
        }
        if (affectedCount === 0) {
          throw new BusinessError(
            'MASTER_DATA_REFERENCE_CHANGED',
            'Inspection identity changed after the audit was created',
            409,
          );
        }
        return { affectedCount, resolvedAuditCount, selection };
      },
      { maxWait: 5000, timeout: 60_000 },
    );
  },
};
