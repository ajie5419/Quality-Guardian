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

export interface BackfillIntegrityMetric {
  ambiguous?: number;
  concurrentChanges?: number;
  conflicts?: number;
  name: string;
  unresolved?: number;
}

export interface OpenAuditDelta {
  changedKeys: string[];
  newKeys: string[];
}

export type OpenAuditSnapshot = Map<string, string>;

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
  const activeTeamIds = new Set(teams.map((team) => team.id));
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
  const resolvedAudits: Array<{ entityId: string; resolvedId: string }> = [];
  const unresolvedAudits: UnresolvedRefInput[] = [];
  let conflicts = 0;

  for (const link of links) {
    if (
      link.isDeleted ||
      link.supplier.isDeleted ||
      !activeTeamIds.has(link.identityId)
    )
      continue;
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
      unresolvedAudits.push({
        entityId: team.id,
        evidence: {
          candidateSupplierId: supplier.id,
          linkedSupplierId: existingLink.supplierId,
        },
        rawId: existingLink.supplierId,
        rawName: team.name,
        reason: 'team_supplier_identity_conflict',
      });
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
    resolvedAudits.push({ entityId: team.id, resolvedId: supplier.id });
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
  if (mode === 'apply') {
    await persistResolutionAudit({
      entityType: 'supplier_identity_links',
      resolved: resolvedAudits,
      unresolved: unresolvedAudits,
    });
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

export function assertBackfillIntegrity(
  metrics: BackfillIntegrityMetric[],
  openAuditDelta?: OpenAuditDelta,
) {
  const failures: string[] = [];
  for (const metric of metrics) {
    const values = {
      ambiguous: metric.ambiguous,
      concurrentChanges: metric.concurrentChanges,
      ...(openAuditDelta
        ? {}
        : { conflicts: metric.conflicts, unresolved: metric.unresolved }),
    };
    for (const [name, value] of Object.entries(values)) {
      if (value && value > 0) failures.push(`${metric.name}.${name}=${value}`);
    }
  }
  if (openAuditDelta) {
    if (openAuditDelta.newKeys.length > 0) {
      failures.push(`open-audits.new=${openAuditDelta.newKeys.length}`);
    }
    if (openAuditDelta.changedKeys.length > 0) {
      failures.push(`open-audits.changed=${openAuditDelta.changedKeys.length}`);
    }
  }
  if (failures.length > 0) {
    throw new Error(
      `Supplier identity backfill integrity check failed: ${failures.join(', ')}`,
    );
  }
}

function buildOpenAuditKey(item: {
  entityId: string;
  entityType: string;
  fieldName: string;
}) {
  return `${item.entityType}:${item.entityId}:${item.fieldName}`;
}

function buildOpenAuditSignature(item: {
  evidence: unknown;
  rawId: null | string;
  rawName: null | string;
  reason: string;
}) {
  return JSON.stringify([item.reason, item.rawId, item.rawName, item.evidence]);
}

export function compareOpenAuditSnapshots(
  before: OpenAuditSnapshot,
  after: OpenAuditSnapshot,
): OpenAuditDelta {
  const changedKeys: string[] = [];
  const newKeys: string[] = [];
  for (const [key, signature] of after) {
    const previous = before.get(key);
    if (previous === undefined) newKeys.push(key);
    else if (previous !== signature) changedKeys.push(key);
  }
  return { changedKeys, newKeys };
}

export async function loadOpenAuditSnapshot(): Promise<OpenAuditSnapshot> {
  const rows = await prisma.unresolved_master_data_refs.findMany({
    where: { isDeleted: false, status: 'OPEN' },
    select: {
      entityId: true,
      entityType: true,
      evidence: true,
      fieldName: true,
      rawId: true,
      rawName: true,
      reason: true,
    },
  });
  return new Map(
    rows.map((item) => [
      buildOpenAuditKey(item),
      buildOpenAuditSignature(item),
    ]),
  );
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
  entityType:
    | 'after_sales'
    | 'inspections'
    | 'qms_inspection_requests'
    | 'quality_records'
    | 'supplier_identity_links';
  fieldName?: 'supplierId' | 'teamId';
  resolved: Array<{ entityId: string; resolvedId: null | string }>;
  unresolved: UnresolvedRefInput[];
}) {
  const fieldName = params.fieldName || 'supplierId';
  const operations = [
    ...params.resolved.map((item) =>
      prisma.unresolved_master_data_refs.updateMany({
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
      prisma.unresolved_master_data_refs.upsert({
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
