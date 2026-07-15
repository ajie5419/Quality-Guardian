import type { BackfillOptions } from './quality-record-supplier-identity-backfill';
import type { UnresolvedRefInput } from './supplier-identity-backfill-runtime';

import { INCOMING_INSPECTION_PROCESS_NAME } from '@qgs/shared';
import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';

import { persistResolutionAudit } from './supplier-identity-backfill-runtime';

interface IdentityContext {
  supplierById: Map<string, { id: string; name: string }>;
  supplierByName: Map<string, { id: string; name: string }>;
}

const logger = createModuleLogger(
  'inspection-request-supplier-identity-backfill',
);

export async function backfillInspectionRequestSupplierIdentities(
  options: BackfillOptions,
  context: IdentityContext,
) {
  let batches = 0;
  let concurrentChanges = 0;
  let cursorId: string | undefined;
  let processed = 0;
  let unresolved = 0;
  let updated = 0;

  while (!options.maxBatches || batches < options.maxBatches) {
    const rows = await prisma.qms_inspection_requests.findMany({
      where: {
        isDeleted: false,
        processName: INCOMING_INSPECTION_PROCESS_NAME,
        ...(cursorId ? { id: { gt: cursorId } } : {}),
      },
      orderBy: { id: 'asc' },
      take: options.batchSize,
      select: {
        id: true,
        inspection: {
          select: { supplierId: true },
        },
        requestNo: true,
        supplierId: true,
        team: true,
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
      const existingSupplier = row.supplierId
        ? context.supplierById.get(row.supplierId) || null
        : null;
      if (row.supplierId && !existingSupplier) {
        unresolved += 1;
        batchUnresolved.push({
          entityId: row.id,
          evidence: { requestNo: row.requestNo },
          rawId: row.supplierId,
          rawName: row.team,
          reason: 'invalid_existing_supplier_id',
        });
        continue;
      }
      const inspectionSupplier = row.inspection?.supplierId
        ? context.supplierById.get(row.inspection.supplierId) || null
        : null;
      const nameSupplier = row.team
        ? context.supplierByName.get(row.team) || null
        : null;
      if (
        existingSupplier &&
        ((inspectionSupplier &&
          inspectionSupplier.id !== existingSupplier.id) ||
          (nameSupplier && nameSupplier.id !== existingSupplier.id))
      ) {
        unresolved += 1;
        batchUnresolved.push({
          entityId: row.id,
          evidence: {
            existingSupplierId: existingSupplier.id,
            inspectionSupplierId: inspectionSupplier?.id || null,
            nameSupplierId: nameSupplier?.id || null,
            requestNo: row.requestNo,
          },
          rawId: row.supplierId,
          rawName: row.team,
          reason: 'supplier_identity_conflict',
        });
        continue;
      }
      const candidate = existingSupplier || inspectionSupplier || nameSupplier;
      if (!candidate) {
        unresolved += 1;
        batchUnresolved.push({
          entityId: row.id,
          evidence: { requestNo: row.requestNo },
          rawId: row.supplierId,
          rawName: row.team,
          reason: 'supplier_identity_not_resolved',
        });
        continue;
      }
      if (
        inspectionSupplier &&
        nameSupplier &&
        inspectionSupplier.id !== nameSupplier.id
      ) {
        unresolved += 1;
        batchUnresolved.push({
          entityId: row.id,
          evidence: {
            inspectionSupplierId: inspectionSupplier.id,
            nameSupplierId: nameSupplier.id,
            requestNo: row.requestNo,
          },
          rawId: row.supplierId,
          rawName: row.team,
          reason: 'supplier_identity_conflict',
        });
        continue;
      }
      if (row.supplierId === candidate.id && row.team === candidate.name) {
        batchResolved.push({ entityId: row.id, resolvedId: candidate.id });
        continue;
      }
      batchUpdates.push({
        candidate,
        existingSupplierId: row.supplierId,
        id: row.id,
      });
    }

    if (options.mode === 'apply' && batchUpdates.length > 0) {
      const results = await prisma.$transaction(
        batchUpdates.map((item) =>
          prisma.qms_inspection_requests.updateMany({
            where: {
              id: item.id,
              isDeleted: false,
              supplierId: item.existingSupplierId,
            },
            data: {
              supplierId: item.candidate.id,
              team: item.candidate.name,
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
        entityType: 'qms_inspection_requests',
        resolved: batchResolved,
        unresolved: batchUnresolved,
      });
    }
  }

  const summary = {
    batches,
    concurrentChanges,
    mode: options.mode,
    processed,
    unresolved,
    updated,
  };
  logger.info(
    summary,
    'inspection request supplier identity backfill finished',
  );
  return summary;
}
