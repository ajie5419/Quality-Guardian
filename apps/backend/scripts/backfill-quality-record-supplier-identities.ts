import type { SupplierIdentity } from './quality-record-supplier-identity-backfill';
import type { UnresolvedRefInput } from './supplier-identity-backfill-runtime';

import process from 'node:process';

import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';
import { redis } from '~/utils/redis';

import { backfillAfterSalesSupplierIdentities } from './backfill-after-sales-supplier-identities';
import { backfillInspectionRequestSupplierIdentities } from './backfill-inspection-request-supplier-identities';
import { backfillInspectionRequestTeamIdentities } from './backfill-inspection-request-team-identities';
import { backfillInspectionSupplierIdentities } from './backfill-inspection-supplier-identities';
import {
  parseBackfillOptions,
  resolveQualityRecordSupplierIdentity,
} from './quality-record-supplier-identity-backfill';
import {
  bootstrapExactTeamLinks,
  loadSupplierIdentityContext,
  persistResolutionAudit,
} from './supplier-identity-backfill-runtime';

const logger = createModuleLogger('quality-record-supplier-identity-backfill');
const SAMPLE_LIMIT = 20;

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

  const identityContext = await loadSupplierIdentityContext(
    teamBootstrap.effectiveLinks,
  );
  await backfillInspectionRequestTeamIdentities(options, identityContext);
  await backfillInspectionRequestSupplierIdentities(options, identityContext);
  await backfillInspectionSupplierIdentities(options, identityContext);
  await backfillAfterSalesSupplierIdentities(options, identityContext);

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
      const inspectionTeamId = row.inspection?.teamId || null;
      const teamLink = inspectionTeamId
        ? identityContext.effectiveLinks.get(inspectionTeamId)
        : undefined;
      const processSupplier = teamLink?.supplier || null;
      const resolution = resolveQualityRecordSupplierIdentity({
        existingSupplier: row.supplierId
          ? identityContext.supplierById.get(row.supplierId) || null
          : null,
        existingSupplierId: row.supplierId,
        inspection: row.inspection
          ? {
              category: row.inspection.category,
              processSupplier,
              supplierById: row.inspection.supplierId
                ? identityContext.supplierById.get(row.inspection.supplierId) ||
                  null
                : null,
              supplierByName: row.inspection.supplierName
                ? identityContext.supplierByName.get(
                    row.inspection.supplierName,
                  ) || null
                : null,
            }
          : null,
        supplierByRecordName: row.supplierName
          ? identityContext.supplierByName.get(row.supplierName) || null
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
        entityType: 'quality_records',
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
