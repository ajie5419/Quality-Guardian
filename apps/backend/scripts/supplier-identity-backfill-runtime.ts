import type { SupplierIdentity } from './quality-record-supplier-identity-backfill';

import { Prisma, team_identity_merge_status } from '@prisma/client';
import { resolveSupplierInspectionPolicy } from '@qgs/shared';
import prisma from '~/utils/prisma';

import { buildUniqueIdentityMap } from './quality-record-supplier-identity-backfill';

export interface EffectiveTeamLink {
  supplier: SupplierIdentity;
}

export interface TeamIdentity {
  id: string;
  name: string;
}

export interface ExplicitTeamLinkLoadResult {
  conflicts: number;
  effectiveLinks: Map<string, EffectiveTeamLink>;
}

export interface BackfillIntegrityMetric {
  ambiguous?: number;
  concurrentChanges?: number;
  conflicts?: number;
  name: string;
  unresolved?: number;
}

export interface UnresolvedRefInput {
  entityId: string;
  evidence: Record<string, null | number | string>;
  rawId: null | string;
  rawName: null | string;
  reason: string;
}

export async function loadExplicitTeamLinks(
  mode: 'apply' | 'dry-run',
): Promise<ExplicitTeamLinkLoadResult> {
  const [teams, links] = await Promise.all([
    prisma.dictionaries.findMany({
      where: { dictType: 'team', isDeleted: false, status: 1 },
      select: { dictKey: true, id: true },
    }),
    prisma.supplier_identity_links.findMany({
      where: { identityType: 'TEAM' },
      include: {
        supplier: {
          select: {
            category: true,
            id: true,
            isDeleted: true,
            name: true,
            outsourcingMode: true,
          },
        },
      },
    }),
  ]);
  const sources = await prisma.team_identity_sources.findMany({
    where: {
      isDeleted: false,
      teamId: { in: [...new Set(links.map((link) => link.identityId))] },
      OR: [
        { sourceType: 'DEPARTMENT' },
        {
          sourceId: { in: [...new Set(links.map((link) => link.supplierId))] },
          sourceType: 'SUPPLIER',
        },
      ],
    },
    select: { sourceId: true, sourceType: true, teamId: true },
  });

  const activeTeamIds = new Set(teams.map((team) => team.id));
  const supplierTeamSourcePairs = new Set(
    sources
      .filter((source) => source.sourceType === 'SUPPLIER')
      .map((source) => `${source.teamId}:${source.sourceId}`),
  );
  const departmentTeamIds = new Set(
    sources
      .filter((source) => source.sourceType === 'DEPARTMENT')
      .map((source) => source.teamId),
  );
  const effectiveLinks = new Map<string, EffectiveTeamLink>();
  const unresolvedAudits: UnresolvedRefInput[] = [];
  let conflicts = 0;

  for (const link of links) {
    if (link.isDeleted) continue;
    if (
      link.supplier.isDeleted ||
      !activeTeamIds.has(link.identityId) ||
      resolveSupplierInspectionPolicy(link.supplier).identitySource !==
        'team' ||
      !supplierTeamSourcePairs.has(`${link.identityId}:${link.supplierId}`) ||
      departmentTeamIds.has(link.identityId)
    ) {
      conflicts += 1;
      unresolvedAudits.push({
        entityId: link.id,
        evidence: {
          activeTeam: activeTeamIds.has(link.identityId) ? 'true' : 'false',
          supplierCategory: link.supplier.category || '',
          supplierOutsourcingMode: link.supplier.outsourcingMode || '',
          teamId: link.identityId,
          teamSourceConflict: departmentTeamIds.has(link.identityId)
            ? 'true'
            : 'false',
        },
        rawId: link.supplierId,
        rawName: link.identityNameSnapshot,
        reason: 'invalid_explicit_process_team_link',
      });
      continue;
    }
    effectiveLinks.set(link.identityId, {
      supplier: { id: link.supplier.id, name: link.supplier.name },
    });
  }
  if (mode === 'apply') {
    await persistResolutionAudit({
      entityType: 'supplier_identity_links',
      resolved: [],
      unresolved: unresolvedAudits,
    });
  }

  return {
    conflicts,
    effectiveLinks,
  };
}

export function assertBackfillIntegrity(metrics: BackfillIntegrityMetric[]) {
  const failures: string[] = [];
  for (const metric of metrics) {
    const values = {
      ambiguous: metric.ambiguous,
      concurrentChanges: metric.concurrentChanges,
      conflicts: metric.conflicts,
      unresolved: metric.unresolved,
    };
    for (const [name, value] of Object.entries(values)) {
      if (value && value > 0) failures.push(`${metric.name}.${name}=${value}`);
    }
  }
  if (failures.length > 0) {
    throw new Error(
      `Supplier identity backfill integrity check failed: ${failures.join(', ')}`,
    );
  }
}

export async function loadSupplierIdentityContext(
  effectiveLinks: Map<string, EffectiveTeamLink>,
) {
  const [suppliers, teams, completedMerges, aliases, sources] =
    await Promise.all([
      prisma.suppliers.findMany({
        where: { isDeleted: false },
        select: { id: true, name: true },
      }),
      prisma.dictionaries.findMany({
        where: { dictType: 'team', isDeleted: false, status: 1 },
        select: { dictKey: true, id: true },
      }),
      prisma.team_identity_merges.findMany({
        where: {
          isDeleted: false,
          status: team_identity_merge_status.COMPLETED,
        },
        select: { sourceTeamId: true, targetTeamId: true },
      }),
      prisma.team_identity_aliases.findMany({
        where: { isDeleted: false },
        select: { alias: true, teamId: true },
      }),
      prisma.team_identity_sources.findMany({
        where: {
          isDeleted: false,
          sourceType: { in: ['DEPARTMENT', 'SUPPLIER'] },
        },
        select: { sourceType: true, teamId: true },
      }),
    ]);
  const teamIdentities = teams.map((item) => ({
    id: item.id,
    name: item.dictKey,
  }));
  const teamById = new Map(teamIdentities.map((item) => [item.id, item]));
  const teamByName = buildUniqueIdentityMap(teamIdentities);

  // Historical rows may still reference retired source TEAMs of completed
  // merges. Resolve those references through the canonical mapping instead of
  // flagging them unresolved, keeping the record-only merge contract.
  for (const merge of completedMerges) {
    const target = teamById.get(merge.targetTeamId);
    if (!target || teamById.has(merge.sourceTeamId)) continue;
    teamById.set(merge.sourceTeamId, target);
    const targetLink = effectiveLinks.get(merge.targetTeamId);
    if (targetLink) effectiveLinks.set(merge.sourceTeamId, targetLink);
  }
  // Retired names (e.g. workshop variants) resolve to their canonical TEAM
  // unless the alias collides with an active team name.
  for (const alias of aliases) {
    const team = teamById.get(alias.teamId);
    if (team && !teamByName.has(alias.alias)) {
      teamByName.set(alias.alias, team);
    }
  }

  const externalTeamIds = new Set(
    sources
      .filter((source) => source.sourceType === 'SUPPLIER')
      .map((source) => source.teamId),
  );

  return {
    effectiveLinks,
    supplierById: new Map(suppliers.map((item) => [item.id, item])),
    supplierByName: buildUniqueIdentityMap(suppliers),
    externalTeamIds,
    internalTeamIds: new Set(
      sources
        .filter(
          (source) =>
            source.sourceType === 'DEPARTMENT' &&
            !externalTeamIds.has(source.teamId),
        )
        .map((source) => source.teamId),
    ),
    teamById,
    teamByName,
  };
}

export async function persistResolutionAudit(
  params: {
    cleared?: Array<{
      entityId: string;
      evidence: Record<string, null | number | string>;
      rawId: null | string;
      rawName: null | string;
      reason: string;
    }>;
    entityType:
      | 'after_sales'
      | 'inspections'
      | 'qms_inspection_requests'
      | 'quality_records'
      | 'supplier_identity_links';
    fieldName?: 'supplierId' | 'teamId';
    resolved: Array<{ entityId: string; resolvedId: null | string }>;
    unresolved: UnresolvedRefInput[];
  },
  client?: Prisma.TransactionClient,
) {
  const db = client || prisma;
  const fieldName = params.fieldName || 'supplierId';
  const cleared = params.cleared || [];
  const operations = [
    ...(cleared.length > 0
      ? [
          db.unresolved_master_data_refs.createMany({
            data: cleared.map((item) => ({
              entityId: item.entityId,
              entityType: params.entityType,
              evidence: item.evidence,
              fieldName,
              rawId: item.rawId,
              rawName: item.rawName,
              reason: item.reason,
              resolvedAt: new Date(),
              resolutionNote:
                'Cleared by deterministic internal TEAM supplier identity backfill',
              resolvedId: null,
              status: 'RESOLVED' as const,
            })),
            skipDuplicates: true,
          }),
          ...cleared.map((item) =>
            db.unresolved_master_data_refs.updateMany({
              where: {
                entityId: item.entityId,
                entityType: params.entityType,
                fieldName,
                isDeleted: false,
                status: 'OPEN',
              },
              data: {
                evidence: item.evidence,
                rawId: item.rawId,
                rawName: item.rawName,
                reason: item.reason,
                resolvedAt: new Date(),
                resolutionNote:
                  'Cleared by deterministic internal TEAM supplier identity backfill',
                resolvedId: null,
                status: 'RESOLVED',
              },
            }),
          ),
        ]
      : []),
    ...params.resolved.map((item) =>
      db.unresolved_master_data_refs.updateMany({
        where: {
          entityId: item.entityId,
          entityType: params.entityType,
          fieldName,
          isDeleted: false,
          status: 'OPEN',
        },
        data: {
          resolutionNote: 'Resolved by supplier identity backfill',
          resolvedAt: new Date(),
          resolvedId: item.resolvedId,
          status: 'RESOLVED',
        },
      }),
    ),
    ...params.unresolved.map((item) =>
      db.unresolved_master_data_refs.upsert({
        where: {
          entityType_entityId_fieldName: {
            entityId: item.entityId,
            entityType: params.entityType,
            fieldName,
          },
        },
        create: {
          entityId: item.entityId,
          entityType: params.entityType,
          evidence: item.evidence,
          fieldName,
          rawId: item.rawId,
          rawName: item.rawName,
          reason: item.reason,
        },
        update: {
          evidence: item.evidence,
          isDeleted: false,
          rawId: item.rawId,
          rawName: item.rawName,
          reason: item.reason,
        },
      }),
    ),
  ];
  if (operations.length > 0) {
    await (client ? Promise.all(operations) : prisma.$transaction(operations));
  }
}
