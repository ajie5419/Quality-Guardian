import type { Prisma } from '@prisma/client';

import { team_identity_alias_kind } from '@prisma/client';
import { BusinessError } from '~/utils/business-error';

import { migrateSupplierLinks } from './team-identity-merge-supplier';
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

export const TEAM_IDENTITY_REFERENCE_GROUPS = [
  'inspectionRequests',
  'inspections',
  'welders',
  'workOrderRequirements',
  'identityMetadata',
] as const;

export type TeamIdentityReferenceGroup =
  (typeof TEAM_IDENTITY_REFERENCE_GROUPS)[number];

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

async function migrateSingleBatch(
  runBatch: () => Promise<{ scanned: number; updated: number }>,
) {
  const batch = await runBatch();
  return batch.updated;
}

function assertBatchApplied(scanned: number, updated: number) {
  if (updated !== scanned) {
    throw new BusinessError(
      'TEAM_MERGE_REFERENCE_CONFLICT',
      'A TEAM reference changed during merge execution',
      409,
    );
  }
}

async function migrateInspectionRequests(
  tx: Prisma.TransactionClient,
  merge: TeamIdentityMergeContext,
  batchSize: number,
) {
  return migrateSingleBatch(() =>
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
      assertBatchApplied(ids.length, result.count);
      await resolveBatchAudits(
        tx,
        'qms_inspection_requests',
        'teamId',
        ids,
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
  return migrateSingleBatch(() =>
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
      assertBatchApplied(ids.length, result.count);
      await resolveBatchAudits(tx, 'inspections', 'teamId', ids, merge);
      return { scanned: ids.length, updated: result.count };
    })(),
  );
}

async function migrateWelders(
  tx: Prisma.TransactionClient,
  merge: TeamIdentityMergeContext,
  batchSize: number,
) {
  return migrateSingleBatch(() =>
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
      assertBatchApplied(ids.length, result.count);
      await resolveBatchAudits(tx, 'welders', 'teamId', ids, merge);
      return { scanned: ids.length, updated: result.count };
    })(),
  );
}

async function migrateWorkOrderRequirements(
  tx: Prisma.TransactionClient,
  merge: TeamIdentityMergeContext,
  batchSize: number,
) {
  return migrateSingleBatch(() =>
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
      assertBatchApplied(ids.length, result.count);
      await resolveBatchAudits(
        tx,
        'work_order_requirements',
        'responsibleTeamId',
        ids,
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
    where: { isDeleted: false, nameKey, teamId: merge.targetTeamId },
  });
  if (existing) {
    let canonicalUpdate: Partial<{
      alias: string;
      aliasKind: team_identity_alias_kind;
    }> = {};
    if (aliasKind === team_identity_alias_kind.CANONICAL) {
      canonicalUpdate = { alias, aliasKind };
    } else if (existing.aliasKind !== team_identity_alias_kind.CANONICAL) {
      canonicalUpdate = { aliasKind };
    }
    return tx.team_identity_aliases.update({
      where: { id: existing.id },
      data: { ...canonicalUpdate, isDeleted: false, nameKey },
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
  const targetAliasKeys = new Set(
    aliases
      .filter((alias) => alias.teamId === merge.targetTeamId)
      .map((alias) => alias.nameKey),
  );
  for (const alias of sourceAliases) {
    if (targetAliasKeys.has(alias.nameKey)) {
      await tx.team_identity_aliases.update({
        where: { id: alias.id },
        data: { isDeleted: true },
      });
      continue;
    }
    await tx.team_identity_aliases.update({
      where: { id: alias.id },
      data: {
        aliasKind: team_identity_alias_kind.HISTORICAL,
        teamId: merge.targetTeamId,
      },
    });
    targetAliasKeys.add(alias.nameKey);
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
  for (const group of TEAM_IDENTITY_REFERENCE_GROUPS) {
    while (true) {
      const delta = await migrateTeamReferenceGroup(
        tx,
        merge,
        group,
        batchSize,
        operator,
      );
      for (const key of Object.keys(delta) as Array<keyof typeof counts>) {
        counts[key] += delta[key] ?? 0;
      }
      if (
        group === 'identityMetadata' ||
        Object.values(delta).every((count) => count === 0)
      ) {
        break;
      }
    }
  }
  return counts;
}

export async function migrateTeamReferenceGroup(
  tx: Prisma.TransactionClient,
  merge: TeamIdentityMergeContext,
  group: TeamIdentityReferenceGroup,
  batchSize: number,
  operator: string,
): Promise<Partial<TeamIdentityReferenceCounts>> {
  switch (group) {
    case 'identityMetadata': {
      return migrateIdentityMetadata(tx, merge, operator);
    }
    case 'inspectionRequests': {
      return {
        inspectionRequests: await migrateInspectionRequests(
          tx,
          merge,
          batchSize,
        ),
      };
    }
    case 'inspections': {
      return { inspections: await migrateInspections(tx, merge, batchSize) };
    }
    case 'welders': {
      return { welders: await migrateWelders(tx, merge, batchSize) };
    }
    case 'workOrderRequirements': {
      return {
        workOrderRequirements: await migrateWorkOrderRequirements(
          tx,
          merge,
          batchSize,
        ),
      };
    }
  }
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
      where: { identityId: sourceTeamId, isDeleted: false },
    }),
    tx.team_identity_aliases.count({
      where: { isDeleted: false, teamId: sourceTeamId },
    }),
    tx.team_identity_name_keys.count({ where: { teamId: sourceTeamId } }),
    tx.team_identity_sources.count({ where: { teamId: sourceTeamId } }),
  ]);
  return counts.reduce((sum, count) => sum + count, 0);
}
