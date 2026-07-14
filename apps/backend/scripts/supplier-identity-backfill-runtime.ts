import type { SupplierIdentity } from './quality-record-supplier-identity-backfill';

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

export interface TeamLinkBootstrapResult {
  ambiguous: number;
  conflicts: number;
  created: number;
  effectiveLinks: Map<string, EffectiveTeamLink>;
  reactivated: number;
}

export interface UnresolvedRefInput {
  entityId: string;
  evidence: Record<string, null | number | string>;
  rawId: null | string;
  rawName: null | string;
  reason: string;
}

export async function bootstrapExactTeamLinks(
  mode: 'apply' | 'dry-run',
): Promise<TeamLinkBootstrapResult> {
  const [suppliers, teams, links] = await Promise.all([
    prisma.suppliers.findMany({
      where: { isDeleted: false },
      select: {
        category: true,
        id: true,
        name: true,
        outsourcingMode: true,
      },
    }),
    prisma.dictionaries.findMany({
      where: { dictType: 'team', isDeleted: false, status: 1 },
      select: { dictKey: true, id: true },
    }),
    prisma.supplier_identity_links.findMany({
      where: { identityType: 'TEAM' },
      include: {
        supplier: { select: { id: true, isDeleted: true, name: true } },
      },
    }),
  ]);

  const processSuppliers = suppliers.filter(
    (supplier) =>
      resolveSupplierInspectionPolicy(supplier).identitySource === 'team',
  );
  const uniqueSupplierByName = buildUniqueIdentityMap(processSuppliers);
  const uniqueTeamByName = buildUniqueIdentityMap(
    teams.map((team) => ({ id: team.id, name: team.dictKey })),
  );
  const linkByTeamId = new Map(links.map((link) => [link.identityId, link]));
  const effectiveLinks = new Map<string, EffectiveTeamLink>();
  const creates: Array<{
    identityId: string;
    identityNameSnapshot: string;
    supplierId: string;
  }> = [];
  const reactivations: Array<{
    id: string;
    identityNameSnapshot: string;
  }> = [];
  let conflicts = 0;

  for (const link of links) {
    if (link.isDeleted || link.supplier.isDeleted) continue;
    effectiveLinks.set(link.identityId, {
      supplier: { id: link.supplier.id, name: link.supplier.name },
    });
  }

  for (const supplier of uniqueSupplierByName.values()) {
    const team = uniqueTeamByName.get(supplier.name);
    if (!team) continue;
    const existingLink = linkByTeamId.get(team.id);
    if (existingLink && existingLink.supplierId !== supplier.id) {
      conflicts += 1;
      continue;
    }
    if (existingLink?.isDeleted) {
      reactivations.push({
        id: existingLink.id,
        identityNameSnapshot: team.name,
      });
    } else if (!existingLink) {
      creates.push({
        identityId: team.id,
        identityNameSnapshot: team.name,
        supplierId: supplier.id,
      });
    }
    if (!existingLink || existingLink.isDeleted) {
      effectiveLinks.set(team.id, {
        supplier: { id: supplier.id, name: supplier.name },
      });
    }
  }

  if (mode === 'apply' && (creates.length > 0 || reactivations.length > 0)) {
    await prisma.$transaction([
      ...reactivations.map((link) =>
        prisma.supplier_identity_links.update({
          where: { id: link.id },
          data: {
            identityNameSnapshot: link.identityNameSnapshot,
            isDeleted: false,
          },
        }),
      ),
      prisma.supplier_identity_links.createMany({
        data: creates.map((link) => ({
          ...link,
          identityType: 'TEAM' as const,
        })),
        skipDuplicates: true,
      }),
    ]);
  }

  return {
    ambiguous:
      processSuppliers.length -
      uniqueSupplierByName.size +
      teams.length -
      uniqueTeamByName.size,
    conflicts,
    created: creates.length,
    effectiveLinks,
    reactivated: reactivations.length,
  };
}

export async function loadSupplierIdentityContext(
  effectiveLinks: Map<string, EffectiveTeamLink>,
) {
  const [suppliers, teams] = await Promise.all([
    prisma.suppliers.findMany({
      where: { isDeleted: false },
      select: { id: true, name: true },
    }),
    prisma.dictionaries.findMany({
      where: { dictType: 'team', isDeleted: false, status: 1 },
      select: { dictKey: true, id: true },
    }),
  ]);
  const teamIdentities = teams.map((item) => ({
    id: item.id,
    name: item.dictKey,
  }));

  return {
    effectiveLinks,
    supplierById: new Map(suppliers.map((item) => [item.id, item])),
    supplierByName: buildUniqueIdentityMap(suppliers),
    teamById: new Map(teamIdentities.map((item) => [item.id, item])),
    teamByName: buildUniqueIdentityMap(teamIdentities),
  };
}

export async function persistResolutionAudit(params: {
  entityType: 'inspections' | 'quality_records';
  resolved: Array<{ entityId: string; resolvedId: string }>;
  unresolved: UnresolvedRefInput[];
}) {
  const operations = [
    ...params.resolved.map((item) =>
      prisma.unresolved_master_data_refs.updateMany({
        where: {
          entityId: item.entityId,
          entityType: params.entityType,
          fieldName: 'supplierId',
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
      prisma.unresolved_master_data_refs.upsert({
        where: {
          entityType_entityId_fieldName: {
            entityId: item.entityId,
            entityType: params.entityType,
            fieldName: 'supplierId',
          },
        },
        create: {
          entityId: item.entityId,
          entityType: params.entityType,
          evidence: item.evidence,
          fieldName: 'supplierId',
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
          resolutionNote: null,
          resolvedAt: null,
          resolvedId: null,
          status: 'OPEN',
        },
      }),
    ),
  ];
  if (operations.length > 0) {
    await prisma.$transaction(operations);
  }
}
