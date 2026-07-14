import type { SupplierIdentity } from './quality-record-supplier-identity-backfill';

import process from 'node:process';

import { resolveSupplierInspectionPolicy } from '@qgs/shared';
import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';
import { redis } from '~/utils/redis';

import {
  buildUniqueIdentityMap,
  parseBackfillOptions,
  resolveQualityRecordSupplierIdentity,
} from './quality-record-supplier-identity-backfill';

const logger = createModuleLogger('quality-record-supplier-identity-backfill');
const SAMPLE_LIMIT = 20;

interface EffectiveTeamLink {
  supplier: SupplierIdentity;
}

interface TeamLinkBootstrapResult {
  ambiguous: number;
  conflicts: number;
  created: number;
  effectiveLinks: Map<string, EffectiveTeamLink>;
  reactivated: number;
}

interface UnresolvedRefInput {
  entityId: string;
  evidence: Record<string, null | number | string>;
  rawId: null | string;
  rawName: null | string;
  reason: string;
}

type ResolutionSample = {
  date: Date;
  id: string;
  inspectionCategory: null | string;
  inspectionId: null | string;
  reason: string;
  serialNumber: number;
  supplierId: null | string;
  supplierName: null | string;
};

function addSample(samples: ResolutionSample[], sample: ResolutionSample) {
  if (samples.length < SAMPLE_LIMIT) samples.push(sample);
}

async function bootstrapExactTeamLinks(
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

async function persistResolutionAudit(params: {
  resolved: Array<{ entityId: string; resolvedId: string }>;
  unresolved: UnresolvedRefInput[];
}) {
  const operations = [
    ...params.resolved.map((item) =>
      prisma.unresolved_master_data_refs.updateMany({
        where: {
          entityId: item.entityId,
          entityType: 'quality_records',
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
            entityType: 'quality_records',
            fieldName: 'supplierId',
          },
        },
        create: {
          entityId: item.entityId,
          entityType: 'quality_records',
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

async function main() {
  const options = parseBackfillOptions(process.argv.slice(2));
  logger.info(options, 'supplier identity audit/backfill started');

  const teamBootstrap = await bootstrapExactTeamLinks(options.mode);
  logger.info(
    {
      ambiguous: teamBootstrap.ambiguous,
      conflicts: teamBootstrap.conflicts,
      created: teamBootstrap.created,
      mode: options.mode,
      reactivated: teamBootstrap.reactivated,
    },
    'exact supplier to TEAM identity link bootstrap finished',
  );

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
  const supplierById = new Map(suppliers.map((item) => [item.id, item]));
  const supplierByName = buildUniqueIdentityMap(suppliers);
  const teamIdByName = new Map(
    [
      ...buildUniqueIdentityMap(
        teams.map((item) => ({ id: item.id, name: item.dictKey })),
      ),
    ].map(([name, item]) => [name, item.id]),
  );

  let batches = 0;
  let conflicts = 0;
  let cursorId: string | undefined;
  let processed = 0;
  let skipped = 0;
  let unresolved = 0;
  let updated = 0;
  let concurrentChanges = 0;
  const conflictSamples: ResolutionSample[] = [];
  const unresolvedSamples: ResolutionSample[] = [];

  while (!options.maxBatches || batches < options.maxBatches) {
    const rows = await prisma.quality_records.findMany({
      where: {
        isDeleted: false,
        ...(cursorId ? { id: { gt: cursorId } } : {}),
      },
      orderBy: { id: 'asc' },
      take: options.batchSize,
      select: {
        date: true,
        id: true,
        inspectionId: true,
        serialNumber: true,
        supplierId: true,
        supplierName: true,
        inspection: {
          select: {
            category: true,
            supplierId: true,
            supplierName: true,
            team: true,
            teamId: true,
          },
        },
      },
    });
    if (rows.length === 0) break;

    batches += 1;
    processed += rows.length;
    cursorId = rows.at(-1)?.id;
    const batchUpdates: Array<{
      candidate: SupplierIdentity;
      existingSupplierId: null | string;
      id: string;
    }> = [];
    const batchResolved: Array<{ entityId: string; resolvedId: string }> = [];
    const batchUnresolved: UnresolvedRefInput[] = [];

    for (const row of rows) {
      const inspectionTeamId =
        row.inspection?.teamId ||
        (row.inspection?.team
          ? teamIdByName.get(row.inspection.team) || null
          : null);
      const teamLink = inspectionTeamId
        ? teamBootstrap.effectiveLinks.get(inspectionTeamId)
        : undefined;
      const processSupplier = teamLink?.supplier || null;
      const resolution = resolveQualityRecordSupplierIdentity({
        existingSupplier: row.supplierId
          ? supplierById.get(row.supplierId) || null
          : null,
        existingSupplierId: row.supplierId,
        inspection: row.inspection
          ? {
              category: row.inspection.category,
              processSupplier,
              supplierById: row.inspection.supplierId
                ? supplierById.get(row.inspection.supplierId) || null
                : null,
              supplierByName: row.inspection.supplierName
                ? supplierByName.get(row.inspection.supplierName) || null
                : null,
            }
          : null,
        supplierByRecordName: row.supplierName
          ? supplierByName.get(row.supplierName) || null
          : null,
      });

      if (resolution.action === 'skip') {
        skipped += 1;
        if (row.supplierId) {
          batchResolved.push({ entityId: row.id, resolvedId: row.supplierId });
        }
        continue;
      }
      const sample = {
        date: row.date,
        id: row.id,
        inspectionCategory: row.inspection?.category || null,
        inspectionId: row.inspectionId,
        reason: resolution.reason,
        serialNumber: row.serialNumber,
        supplierId: row.supplierId,
        supplierName: row.supplierName,
      };
      if (resolution.action === 'conflict') {
        conflicts += 1;
        addSample(conflictSamples, sample);
        batchUnresolved.push({
          entityId: row.id,
          evidence: {
            candidateSupplierId: resolution.candidate.id,
            inspectionCategory: row.inspection?.category || null,
            inspectionId: row.inspectionId,
            serialNumber: row.serialNumber,
          },
          rawId: row.supplierId,
          rawName: row.supplierName,
          reason: resolution.reason,
        });
        continue;
      }
      if (resolution.action === 'unresolved') {
        unresolved += 1;
        addSample(unresolvedSamples, sample);
        batchUnresolved.push({
          entityId: row.id,
          evidence: {
            inspectionCategory: row.inspection?.category || null,
            inspectionId: row.inspectionId,
            serialNumber: row.serialNumber,
          },
          rawId: row.supplierId,
          rawName: row.supplierName,
          reason: resolution.reason,
        });
        continue;
      }
      batchUpdates.push({
        candidate: resolution.candidate,
        existingSupplierId: row.supplierId,
        id: row.id,
      });
    }

    if (options.mode === 'apply' && batchUpdates.length > 0) {
      const results = await prisma.$transaction(
        batchUpdates.map((item) =>
          prisma.quality_records.updateMany({
            where: {
              id: item.id,
              isDeleted: false,
              supplierId: item.existingSupplierId,
            },
            data: {
              supplierId: item.candidate.id,
              supplierName: item.candidate.name,
            },
          }),
        ),
      );
      const applied = results.reduce((sum, result) => sum + result.count, 0);
      results.forEach((result, index) => {
        const update = batchUpdates[index];
        if (result.count > 0 && update) {
          batchResolved.push({
            entityId: update.id,
            resolvedId: update.candidate.id,
          });
        }
      });
      updated += applied;
      concurrentChanges += batchUpdates.length - applied;
    } else {
      updated += batchUpdates.length;
    }
    if (options.mode === 'apply') {
      await persistResolutionAudit({
        resolved: batchResolved,
        unresolved: batchUnresolved,
      });
    }

    logger.info(
      {
        batch: batches,
        cursorId,
        plannedOrUpdated: batchUpdates.length,
        processed: rows.length,
      },
      'supplier identity batch finished',
    );
  }

  logger.info(
    {
      batches,
      concurrentChanges,
      conflictSamples,
      conflicts,
      mode: options.mode,
      processed,
      skipped,
      unresolved,
      unresolvedSamples,
      updated,
    },
    'supplier identity audit/backfill finished',
  );
}

async function run() {
  try {
    await main();
  } finally {
    await prisma.$disconnect();
    redis.disconnect();
  }
}

void run().catch((error: unknown) => {
  logger.error({ error }, 'supplier identity audit/backfill failed');
  process.exitCode = 1;
});
