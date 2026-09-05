import type { AccessScope } from '~/modules/data-scope';

import {
  assertVersionedWriteAffected,
  createScopedRepository,
} from '~/modules/data-scope';
import { FileStorageService } from '~/modules/file-storage';
import { MetricRefreshQueue } from '~/modules/metric-refresh';
import {
  buildSupplierUpdateDataWithCanonical,
  buildSupplierUpsertPayload,
  normalizeSupplierString,
} from '~/modules/supplier/supplier-query';
import { BusinessError } from '~/utils/business-error';
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

  async update(
    id: string,
    payload: SupplierAdmissionPayload,
    expectedVersion: number,
    access?: {
      scope?: AccessScope;
      user?: { id?: number | string; username?: string };
    },
  ) {
    const updateData = await buildSupplierUpdateDataWithCanonical(payload);
    const updated = await prisma.$transaction(async (tx) => {
      const txRepo = createScopedRepository('supplier', tx.suppliers);
      const ctx = {
        user: {
          id: access?.user?.id ?? '',
          username: access?.user?.username,
        },
        scope: access?.scope,
      };
      const current = await txRepo.findAccessible(
        {
          where: { id, isDeleted: false },
          select: { id: true, name: true },
        },
        ctx,
      );
      if (!current) {
        throw new BusinessError('NOT_FOUND', '供应商不存在', 404);
      }
      const result = await txRepo.updateAccessibleVersioned(
        { where: { id }, data: updateData },
        ctx,
        expectedVersion,
      );
      if (result.count === 0) {
        const exists = await txRepo.findAccessible(
          { where: { id, isDeleted: false }, select: { id: true } },
          ctx,
        );
        assertVersionedWriteAffected(result.count, Boolean(exists), '供应商');
      }
      await MetricRefreshQueue.enqueueSupplierScores(
        tx,
        [id],
        'supplier.updated',
      );
      return { ...current, version: expectedVersion + 1 };
    });
    await registerAdmissionDocuments(updated.id, payload);
    return updated;
  },

  async delete(
    id: string,
    expectedVersion: number,
    access?: {
      scope?: AccessScope;
      user?: { id?: number | string; username?: string };
    },
  ) {
    return prisma.$transaction(async (tx) => {
      const txRepo = createScopedRepository('supplier', tx.suppliers);
      const ctx = {
        user: {
          id: access?.user?.id ?? '',
          username: access?.user?.username,
        },
        scope: access?.scope,
      };
      const current = await txRepo.findAccessible(
        {
          where: { id, isDeleted: false },
          select: { id: true, name: true },
        },
        ctx,
      );
      if (!current) {
        throw new BusinessError('NOT_FOUND', '供应商不存在', 404);
      }
      const result = await txRepo.updateAccessibleVersioned(
        {
          where: { id },
          data: { isDeleted: true, updatedAt: new Date() },
        },
        ctx,
        expectedVersion,
      );
      if (result.count === 0) {
        const exists = await txRepo.findAccessible(
          { where: { id, isDeleted: false }, select: { id: true } },
          ctx,
        );
        assertVersionedWriteAffected(result.count, Boolean(exists), '供应商');
      }
      await MetricRefreshQueue.enqueueSupplierScores(
        tx,
        [id],
        'supplier.deleted',
      );
      return current;
    });
  },

  async batchDelete(
    ids: string[],
    access?: {
      scope?: AccessScope;
      user?: { id?: number | string; username?: string };
    },
  ) {
    return prisma.$transaction(async (tx) => {
      const txRepo = createScopedRepository('supplier', tx.suppliers);
      const ctx = {
        user: {
          id: access?.user?.id ?? '',
          username: access?.user?.username,
        },
        scope: access?.scope,
      };
      const existing = await txRepo.findManyAccessible(
        {
          where: { id: { in: ids }, isDeleted: false },
          select: { id: true },
        },
        ctx,
      );
      const result = await txRepo.updateAccessible(
        {
          where: { id: { in: ids } },
          data: { isDeleted: true, updatedAt: new Date() },
        },
        ctx,
      );
      await MetricRefreshQueue.enqueueSupplierScores(
        tx,
        existing.map((item) => item.id),
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
