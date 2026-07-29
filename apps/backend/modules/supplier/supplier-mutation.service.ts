import { FileStorageService } from '~/modules/file-storage';
import { MetricRefreshQueue } from '~/modules/metric-refresh';
import {
  buildSupplierUpdateDataWithCanonical,
  buildSupplierUpsertPayload,
  normalizeSupplierString,
} from '~/modules/supplier/supplier-query';
import { buildGovernedCanonicalWritePairForTable } from '~/utils/governed-write';
import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';

import { createSupplierRecord } from './supplier-create.service';

type SupplierAdmissionPayload = Record<string, unknown>;

const logger = createModuleLogger('supplier-mutation');

async function registerAdmissionDocuments(
  supplierId: string,
  payload: SupplierAdmissionPayload,
) {
  if (!Object.hasOwn(payload, 'admissionDocuments')) return;
  await FileStorageService.registerReferencesFromAttachments({
    attachments: payload.admissionDocuments,
    bizId: supplierId,
    bizType: 'supplier',
    fieldName: 'admissionDocuments',
  });
}

async function upsertSupplier(
  item: Record<string, unknown>,
  reason: string,
  category?: string,
) {
  const payload = buildSupplierUpsertPayload(item, { category });
  if (!payload) return false;
  const [createCanonicalIds, updateCanonicalIds] = await Promise.all([
    buildGovernedCanonicalWritePairForTable('suppliers', payload.create),
    buildGovernedCanonicalWritePairForTable('suppliers', payload.update),
  ]);
  await prisma.$transaction(async (tx) => {
    const supplier = await tx.suppliers.upsert({
      ...payload,
      create: { ...payload.create, ...createCanonicalIds },
      update: { ...payload.update, ...updateCanonicalIds },
    });
    await MetricRefreshQueue.enqueueSupplierScores(tx, [supplier.id], reason);
  });
  return true;
}

export const SupplierMutationService = {
  async createWithOutcome(payload: SupplierAdmissionPayload) {
    const outcome = await prisma.$transaction(async (tx) => {
      const outcome = await createSupplierRecord(payload, tx);
      if (outcome) {
        await MetricRefreshQueue.enqueueSupplierScores(
          tx,
          [outcome.supplier.id],
          outcome.action === 'RESTORE'
            ? 'supplier.restored'
            : 'supplier.created',
        );
      }
      return outcome;
    });
    if (!outcome) return null;
    await registerAdmissionDocuments(outcome.supplier.id, payload);
    return outcome;
  },

  async update(id: string, payload: SupplierAdmissionPayload) {
    const updateData = await buildSupplierUpdateDataWithCanonical(payload);
    const updated = await prisma.$transaction(async (tx) => {
      const updated = await tx.suppliers.update({
        where: { id },
        data: updateData,
      });
      await MetricRefreshQueue.enqueueSupplierScores(
        tx,
        [updated.id],
        'supplier.updated',
      );
      return updated;
    });
    await registerAdmissionDocuments(updated.id, payload);
    return updated;
  },

  async delete(id: string) {
    return prisma.$transaction(async (tx) => {
      const deleted = await tx.suppliers.update({
        where: { id },
        data: { isDeleted: true, updatedAt: new Date() },
      });
      await MetricRefreshQueue.enqueueSupplierScores(
        tx,
        [id],
        'supplier.deleted',
      );
      return deleted;
    });
  },

  async batchDelete(ids: string[]) {
    return prisma.$transaction(async (tx) => {
      const result = await tx.suppliers.updateMany({
        where: { id: { in: ids } },
        data: { isDeleted: true, updatedAt: new Date() },
      });
      await MetricRefreshQueue.enqueueSupplierScores(
        tx,
        ids,
        'supplier.batch-deleted',
      );
      return result;
    });
  },

  async batchUpsert(items: Array<Record<string, unknown>>) {
    const results = { errors: 0, skipped: 0, success: 0 };
    const chunkSize = 20;
    for (let index = 0; index < items.length; index += chunkSize) {
      const chunk = items.slice(index, index + chunkSize);
      await Promise.all(
        chunk.map(async (item) => {
          try {
            const saved = await upsertSupplier(item, 'supplier.batch-upserted');
            if (saved) results.success++;
            else results.skipped++;
          } catch (error) {
            logger.error(error, 'batchUpsertSuppliers: failed to upsert row');
            results.errors++;
          }
        }),
      );
    }
    return results;
  },

  async import(items: Array<Record<string, unknown>>, category?: unknown) {
    const normalizedCategory = normalizeSupplierString(category);
    let successCount = 0;
    for (const item of items) {
      try {
        if (
          await upsertSupplier(item, 'supplier.imported', normalizedCategory)
        ) {
          successCount++;
        }
      } catch (error) {
        logger.error(error, 'importSuppliers: failed to upsert row; skipping');
      }
    }
    return { successCount, totalCount: items.length };
  },
};
