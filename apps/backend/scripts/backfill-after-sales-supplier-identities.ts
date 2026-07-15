import type { BackfillOptions } from './quality-record-supplier-identity-backfill';
import type { UnresolvedRefInput } from './supplier-identity-backfill-runtime';

import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';

import { resolveAfterSalesSupplierIdentity } from './after-sales-supplier-identity-backfill';
import { persistResolutionAudit } from './supplier-identity-backfill-runtime';

const logger = createModuleLogger('after-sales-supplier-identity-backfill');
const SAMPLE_LIMIT = 20;

interface IdentityContext {
  supplierById: Map<string, { id: string; name: string }>;
  supplierByName: Map<string, { id: string; name: string }>;
}

export async function backfillAfterSalesSupplierIdentities(
  options: BackfillOptions,
  context: IdentityContext,
) {
  let batches = 0;
  let concurrentChanges = 0;
  let cursorId: string | undefined;
  let processed = 0;
  let skipped = 0;
  let unresolved = 0;
  let updated = 0;
  const unresolvedSamples: Array<{
    id: string;
    reason: string;
    serialNumber: number;
    supplierBrand: null | string;
    supplierBrandId: null | string;
  }> = [];

  while (!options.maxBatches || batches < options.maxBatches) {
    const rows = await prisma.after_sales.findMany({
      where: {
        isDeleted: false,
        ...(cursorId ? { id: { gt: cursorId } } : {}),
      },
      orderBy: { id: 'asc' },
      take: options.batchSize,
      select: {
        id: true,
        serialNumber: true,
        supplierBrand: true,
        supplierBrandId: true,
      },
    });
    if (rows.length === 0) break;

    batches += 1;
    processed += rows.length;
    cursorId = rows.at(-1)?.id;
    const batchUpdates: Array<{
      candidate: { id: string; name: string };
      existingSupplierId: null | string;
      id: string;
    }> = [];
    const batchResolved: Array<{ entityId: string; resolvedId: string }> = [];
    const batchUnresolved: UnresolvedRefInput[] = [];

    for (const row of rows) {
      const resolution = resolveAfterSalesSupplierIdentity({
        existingSupplier: row.supplierBrandId
          ? context.supplierById.get(row.supplierBrandId) || null
          : null,
        existingSupplierId: row.supplierBrandId,
        supplierByName: row.supplierBrand
          ? context.supplierByName.get(row.supplierBrand) || null
          : null,
      });
      if (resolution.action === 'skip') {
        skipped += 1;
        if (row.supplierBrandId) {
          batchResolved.push({
            entityId: row.id,
            resolvedId: row.supplierBrandId,
          });
        }
        continue;
      }
      if (resolution.action === 'unresolved') {
        unresolved += 1;
        if (unresolvedSamples.length < SAMPLE_LIMIT) {
          unresolvedSamples.push({
            id: row.id,
            reason: resolution.reason,
            serialNumber: row.serialNumber,
            supplierBrand: row.supplierBrand,
            supplierBrandId: row.supplierBrandId,
          });
        }
        batchUnresolved.push({
          entityId: row.id,
          evidence: { serialNumber: row.serialNumber },
          rawId: row.supplierBrandId,
          rawName: row.supplierBrand,
          reason: resolution.reason,
        });
        continue;
      }
      batchUpdates.push({
        candidate: resolution.candidate,
        existingSupplierId: row.supplierBrandId,
        id: row.id,
      });
    }

    if (options.mode === 'apply' && batchUpdates.length > 0) {
      const results = await prisma.$transaction(
        batchUpdates.map((item) =>
          prisma.after_sales.updateMany({
            where: {
              id: item.id,
              isDeleted: false,
              supplierBrandId: item.existingSupplierId,
            },
            data: {
              supplierBrand: item.candidate.name,
              supplierBrandId: item.candidate.id,
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
        entityType: 'after_sales',
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
      'after-sales supplier identity batch finished',
    );
  }

  const summary = {
    batches,
    concurrentChanges,
    mode: options.mode,
    processed,
    skipped,
    unresolved,
    unresolvedSamples,
    updated,
  };
  logger.info(summary, 'after-sales supplier identity audit/backfill finished');
  return summary;
}
