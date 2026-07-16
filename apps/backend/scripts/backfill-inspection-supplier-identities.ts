import type { BackfillOptions } from './quality-record-supplier-identity-backfill';
import type {
  EffectiveTeamLink,
  TeamIdentity,
  UnresolvedRefInput,
} from './supplier-identity-backfill-runtime';

import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';

import { resolveInspectionSupplierIdentity } from './inspection-supplier-identity-backfill';
import { persistResolutionAudit } from './supplier-identity-backfill-runtime';

const logger = createModuleLogger('inspection-supplier-identity-backfill');
const SAMPLE_LIMIT = 20;

interface IdentityContext {
  effectiveLinks: Map<string, EffectiveTeamLink>;
  supplierById: Map<string, { id: string; name: string }>;
  supplierByName: Map<string, { id: string; name: string }>;
  teamById: Map<string, TeamIdentity>;
  teamByName: Map<string, TeamIdentity>;
}

interface ResolutionSample {
  category: string;
  id: string;
  reason: string;
  supplierId: null | string;
  supplierName: null | string;
  team: null | string;
  teamId: null | string;
}

function buildResolutionSample(
  row: {
    category: string;
    id: string;
    supplierId: null | string;
    supplierName: null | string;
    team: null | string;
    teamId: null | string;
  },
  reason: string,
): ResolutionSample {
  return { ...row, reason };
}

export async function backfillInspectionSupplierIdentities(
  options: BackfillOptions,
  context: IdentityContext,
) {
  let batches = 0;
  let concurrentChanges = 0;
  let conflicts = 0;
  let cursorId: string | undefined;
  let processed = 0;
  let skipped = 0;
  let unresolved = 0;
  let updated = 0;
  const conflictSamples: ResolutionSample[] = [];
  const unresolvedSamples: ResolutionSample[] = [];

  while (!options.maxBatches || batches < options.maxBatches) {
    const rows = await prisma.inspections.findMany({
      where: {
        isDeleted: false,
        ...(cursorId ? { id: { gt: cursorId } } : {}),
      },
      orderBy: { id: 'asc' },
      take: options.batchSize,
      select: {
        category: true,
        id: true,
        supplierId: true,
        supplierName: true,
        team: true,
        teamId: true,
      },
    });
    if (rows.length === 0) break;

    batches += 1;
    processed += rows.length;
    cursorId = rows.at(-1)?.id;
    const batchUpdates: Array<{
      existingSupplierId: null | string;
      existingTeamId: null | string;
      id: string;
      supplier: { id: string; name: string };
      team: null | TeamIdentity;
    }> = [];
    const batchResolved: Array<{
      entityId: string;
      resolvedId: null | string;
    }> = [];
    const batchUnresolved: UnresolvedRefInput[] = [];

    for (const row of rows) {
      const teamById = row.teamId
        ? context.teamById.get(row.teamId) || null
        : null;
      const teamByName = row.team
        ? context.teamByName.get(row.team) || null
        : null;
      const resolvedTeam = teamById || teamByName;
      const processSupplier = resolvedTeam
        ? context.effectiveLinks.get(resolvedTeam.id)?.supplier || null
        : null;
      const resolution = resolveInspectionSupplierIdentity({
        category: row.category,
        existingSupplier: row.supplierId
          ? context.supplierById.get(row.supplierId) || null
          : null,
        existingSupplierId: row.supplierId,
        existingSupplierName: row.supplierName,
        existingTeamId: row.teamId,
        existingTeamName: row.team,
        processSupplier,
        supplierByName: row.supplierName
          ? context.supplierByName.get(row.supplierName) || null
          : null,
        teamById,
        teamByName,
      });

      if (resolution.action === 'skip') {
        skipped += 1;
        batchResolved.push({ entityId: row.id, resolvedId: row.supplierId });
        continue;
      }

      if (resolution.action === 'conflict') {
        conflicts += 1;
        if (conflictSamples.length < SAMPLE_LIMIT) {
          conflictSamples.push(buildResolutionSample(row, resolution.reason));
        }
        batchUnresolved.push({
          entityId: row.id,
          evidence: {
            candidateSupplierId: resolution.candidate.id,
            category: row.category,
            team: row.team,
            teamId: row.teamId,
          },
          rawId: row.supplierId,
          rawName: row.supplierName,
          reason: resolution.reason,
        });
        continue;
      }
      if (resolution.action === 'unresolved') {
        unresolved += 1;
        if (unresolvedSamples.length < SAMPLE_LIMIT) {
          unresolvedSamples.push(buildResolutionSample(row, resolution.reason));
        }
        batchUnresolved.push({
          entityId: row.id,
          evidence: {
            category: row.category,
            team: row.team,
            teamId: row.teamId,
          },
          rawId: row.supplierId,
          rawName: row.supplierName,
          reason: resolution.reason,
        });
        continue;
      }
      batchUpdates.push({
        existingSupplierId: row.supplierId,
        existingTeamId: row.teamId,
        id: row.id,
        supplier: resolution.supplier,
        team: resolution.team,
      });
    }

    if (options.mode === 'apply' && batchUpdates.length > 0) {
      const results = await prisma.$transaction(
        batchUpdates.map((item) =>
          prisma.inspections.updateMany({
            where: {
              id: item.id,
              isDeleted: false,
              supplierId: item.existingSupplierId,
              teamId: item.existingTeamId,
            },
            data: {
              supplierId: item.supplier.id,
              supplierName: item.supplier.name,
              ...(item.team
                ? { team: item.team.name, teamId: item.team.id }
                : {}),
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
            resolvedId: update.supplier.id,
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
        entityType: 'inspections',
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
      'inspection supplier identity batch finished',
    );
  }

  const summary = {
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
  };
  logger.info(summary, 'inspection supplier identity audit/backfill finished');
  return summary;
}
