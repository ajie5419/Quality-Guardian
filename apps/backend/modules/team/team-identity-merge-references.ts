import type { Prisma } from '@prisma/client';

import { team_identity_alias_kind } from '@prisma/client';
import { BusinessError } from '~/utils/business-error';

import { buildTeamIdentityNameKey } from './team-identity-write';

export interface TeamIdentityMergeContext {
  auditId: string;
  sourceName: string;
  sourceTeamId: string;
  targetName: string;
  targetTeamId: string;
}

export interface TeamIdentityReferenceCounts {
  inspections: number;
  inspectionRequests: number;
  supplierIdentityLinks: number;
  teamAliases: number;
  teamNameKeys: number;
  teamSources: number;
  welders: number;
  workOrderRequirements: number;
}

type BatchResult = { scanned: number; updated: number };

export function createEmptyReferenceCounts(): TeamIdentityReferenceCounts {
  return {
    inspections: 0,
    inspectionRequests: 0,
    supplierIdentityLinks: 0,
    teamAliases: 0,
    teamNameKeys: 0,
    teamSources: 0,
    welders: 0,
    workOrderRequirements: 0,
  };
}

async function resolveBatchAudits(
  tx: Prisma.TransactionClient,
  entityType: string,
  fieldName: string,
  entityIds: string[],
  merge: TeamIdentityMergeContext,
) {
  if (entityIds.length === 0) return;
  await tx.unresolved_master_data_refs.updateMany({
    where: {
      entityId: { in: entityIds },
      entityType,
      fieldName,
      isDeleted: false,
    },
    data: {
      resolutionNote: `Resolved by TEAM merge ${merge.auditId}`,
      resolvedAt: new Date(),
      resolvedId: merge.targetTeamId,
      status: 'RESOLVED',
    },
  });
}

async function migrateBatches(runBatch: () => Promise<BatchResult>) {
  let updated = 0;
  while (true) {
    const batch = await runBatch();
    if (batch.scanned === 0) return updated;
    updated += batch.updated;
  }
}

async function migrateInspectionRequests(
  tx: Prisma.TransactionClient,
  merge: TeamIdentityMergeContext,
  batchSize: number,
) {
  return migrateBatches(() =>
    (async () => {
      const rows = await tx.qms_inspection_requests.findMany({
        where: { teamId: merge.sourceTeamId },
        orderBy: { id: 'asc' },
        take: batchSize,
        select: { id: true },
      });
      const ids = rows.map((row) => row.id);
      if (ids.length === 0) return { scanned: 0, updated: 0 };
      const result = await tx.qms_inspection_requests.updateMany({
        where: { id: { in: ids }, teamId: merge.sourceTeamId },
        data: { team: merge.targetName, teamId: merge.targetTeamId },
      });
      const applied = await tx.qms_inspection_requests.findMany({
        where: { id: { in: ids }, teamId: merge.targetTeamId },
        select: { id: true },
      });
      await resolveBatchAudits(
        tx,
        'qms_inspection_requests',
        'teamId',
        applied.map((row) => row.id),
        merge,
      );
      return { scanned: ids.length, updated: result.count };
    })(),
  );
}

async function migrateInspections(
  tx: Prisma.TransactionClient,
  merge: TeamIdentityMergeContext,
  batchSize: number,
) {
  return migrateBatches(() =>
    (async () => {
      const rows = await tx.inspections.findMany({
        where: { teamId: merge.sourceTeamId },
        orderBy: { id: 'asc' },
        take: batchSize,
        select: { id: true },
      });
      const ids = rows.map((row) => row.id);
      if (ids.length === 0) return { scanned: 0, updated: 0 };
      const result = await tx.inspections.updateMany({
        where: { id: { in: ids }, teamId: merge.sourceTeamId },
        data: { team: merge.targetName, teamId: merge.targetTeamId },
      });
      const applied = await tx.inspections.findMany({
        where: { id: { in: ids }, teamId: merge.targetTeamId },
        select: { id: true },
      });
      await resolveBatchAudits(
        tx,
        'inspections',
        'teamId',
        applied.map((row) => row.id),
        merge,
      );
      return { scanned: ids.length, updated: result.count };
    })(),
  );
}

async function migrateWelders(
  tx: Prisma.TransactionClient,
  merge: TeamIdentityMergeContext,
  batchSize: number,
) {
  return migrateBatches(() =>
    (async () => {
      const rows = await tx.welders.findMany({
        where: { teamId: merge.sourceTeamId },
        orderBy: { id: 'asc' },
        take: batchSize,
        select: { id: true },
      });
      const ids = rows.map((row) => row.id);
      if (ids.length === 0) return { scanned: 0, updated: 0 };
      const result = await tx.welders.updateMany({
        where: { id: { in: ids }, teamId: merge.sourceTeamId },
        data: { team: merge.targetName, teamId: merge.targetTeamId },
      });
      const applied = await tx.welders.findMany({
        where: { id: { in: ids }, teamId: merge.targetTeamId },
        select: { id: true },
      });
      await resolveBatchAudits(
        tx,
        'welders',
        'teamId',
        applied.map((row) => row.id),
        merge,
      );
      return { scanned: ids.length, updated: result.count };
    })(),
  );
}

async function migrateWorkOrderRequirements(
  tx: Prisma.TransactionClient,
  merge: TeamIdentityMergeContext,
  batchSize: number,
) {
  return migrateBatches(() =>
    (async () => {
      const rows = await tx.work_order_requirements.findMany({
        where: { responsibleTeamId: merge.sourceTeamId },
        orderBy: { id: 'asc' },
        take: batchSize,
        select: { id: true },
      });
      const ids = rows.map((row) => row.id);
      if (ids.length === 0) return { scanned: 0, updated: 0 };
      const result = await tx.work_order_requirements.updateMany({
        where: {
          id: { in: ids },
          responsibleTeamId: merge.sourceTeamId,
        },
        data: {
          responsibleTeam: merge.targetName,
          responsibleTeamId: merge.targetTeamId,
        },
      });
      const applied = await tx.work_order_requirements.findMany({
        where: {
          id: { in: ids },
          responsibleTeamId: merge.targetTeamId,
        },
        select: { id: true },
      });
      await resolveBatchAudits(
        tx,
        'work_order_requirements',
        'responsibleTeamId',
        applied.map((row) => row.id),
        merge,
      );
      return { scanned: ids.length, updated: result.count };
    })(),
  );
}

async function upsertMergeAlias(
  tx: Prisma.TransactionClient,
  merge: TeamIdentityMergeContext,
  alias: string,
  aliasKind: team_identity_alias_kind,
  operator: string,
) {
  const nameKey = buildTeamIdentityNameKey(alias);
  const existing = await tx.team_identity_aliases.findFirst({
    where: { alias, isDeleted: false, teamId: merge.targetTeamId },
  });
  if (existing) {
    return tx.team_identity_aliases.update({
      where: { id: existing.id },
      data: { aliasKind, isDeleted: false, nameKey },
    });
  }
  return tx.team_identity_aliases.create({
    data: {
      alias,
      aliasKind,
      createdBy: operator,
      nameKey,
      teamId: merge.targetTeamId,
    },
  });
}

async function migrateSupplierLinks(
  tx: Prisma.TransactionClient,
  merge: TeamIdentityMergeContext,
) {
  const links = await tx.supplier_identity_links.findMany({
    where: {
      identityId: { in: [merge.sourceTeamId, merge.targetTeamId] },
      identityType: 'TEAM',
    },
  });
  const source = links.find((link) => link.identityId === merge.sourceTeamId);
  const target = links.find((link) => link.identityId === merge.targetTeamId);
  if (!source) return 0;
  if (target) {
    if (
      !source.isDeleted &&
      !target.isDeleted &&
      source.supplierId !== target.supplierId
    ) {
      throw new BusinessError(
        'TEAM_MERGE_SUPPLIER_CONFLICT',
        'TEAM supplier links conflict',
        409,
      );
    }
    await tx.supplier_identity_links.delete({ where: { id: source.id } });
    if (!source.isDeleted) {
      await tx.supplier_identity_links.update({
        where: { id: target.id },
        data: {
          identityNameSnapshot: merge.targetName,
          isDeleted: false,
          supplierId: source.supplierId,
        },
      });
    }
    return 1;
  }
  await tx.supplier_identity_links.update({
    where: { id: source.id },
    data: {
      identityId: merge.targetTeamId,
      identityNameSnapshot: merge.targetName,
    },
  });
  return 1;
}

async function migrateAliases(
  tx: Prisma.TransactionClient,
  merge: TeamIdentityMergeContext,
) {
  const aliases = await tx.team_identity_aliases.findMany({
    where: {
      isDeleted: false,
      teamId: { in: [merge.sourceTeamId, merge.targetTeamId] },
    },
  });
  const sourceAliases = aliases.filter(
    (alias) => alias.teamId === merge.sourceTeamId,
  );
  const targetAliasNames = new Set(
    aliases
      .filter((alias) => alias.teamId === merge.targetTeamId)
      .map((alias) => alias.alias),
  );
  for (const alias of sourceAliases) {
    if (targetAliasNames.has(alias.alias)) {
      await tx.team_identity_aliases.delete({ where: { id: alias.id } });
      continue;
    }
    await tx.team_identity_aliases.update({
      where: { id: alias.id },
      data: {
        aliasKind: team_identity_alias_kind.HISTORICAL,
        teamId: merge.targetTeamId,
      },
    });
    targetAliasNames.add(alias.alias);
  }
  return sourceAliases.length;
}

async function migrateIdentityMetadata(
  tx: Prisma.TransactionClient,
  merge: TeamIdentityMergeContext,
  operator: string,
) {
  const supplierIdentityLinks = await migrateSupplierLinks(tx, merge);
  const teamSources = await tx.team_identity_sources.updateMany({
    where: { teamId: merge.sourceTeamId },
    data: { teamId: merge.targetTeamId },
  });
  const teamAliases = await migrateAliases(tx, merge);
  const teamNameKeys = await tx.team_identity_name_keys.updateMany({
    where: { teamId: merge.sourceTeamId },
    data: { teamId: merge.targetTeamId },
  });
  await upsertMergeAlias(
    tx,
    merge,
    merge.targetName,
    team_identity_alias_kind.CANONICAL,
    operator,
  );
  await upsertMergeAlias(
    tx,
    merge,
    merge.sourceName,
    team_identity_alias_kind.HISTORICAL,
    operator,
  );
  return {
    supplierIdentityLinks,
    teamAliases,
    teamNameKeys: teamNameKeys.count,
    teamSources: teamSources.count,
  };
}

export async function migrateTeamReferences(
  tx: Prisma.TransactionClient,
  merge: TeamIdentityMergeContext,
  batchSize: number,
  operator: string,
) {
  const counts = createEmptyReferenceCounts();
  counts.inspectionRequests = await migrateInspectionRequests(
    tx,
    merge,
    batchSize,
  );
  counts.inspections = await migrateInspections(tx, merge, batchSize);
  counts.welders = await migrateWelders(tx, merge, batchSize);
  counts.workOrderRequirements = await migrateWorkOrderRequirements(
    tx,
    merge,
    batchSize,
  );
  Object.assign(counts, await migrateIdentityMetadata(tx, merge, operator));
  return counts;
}

export async function countTeamReferences(
  tx: Prisma.TransactionClient,
  sourceTeamId: string,
) {
  const counts = await Promise.all([
    tx.inspections.count({ where: { teamId: sourceTeamId } }),
    tx.qms_inspection_requests.count({ where: { teamId: sourceTeamId } }),
    tx.welders.count({ where: { teamId: sourceTeamId } }),
    tx.work_order_requirements.count({
      where: { responsibleTeamId: sourceTeamId },
    }),
    tx.supplier_identity_links.count({
      where: { identityId: sourceTeamId },
    }),
    tx.team_identity_aliases.count({ where: { teamId: sourceTeamId } }),
    tx.team_identity_name_keys.count({ where: { teamId: sourceTeamId } }),
    tx.team_identity_sources.count({ where: { teamId: sourceTeamId } }),
  ]);
  return counts.reduce((sum, count) => sum + count, 0);
}
