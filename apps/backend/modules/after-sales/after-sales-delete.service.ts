import type { AccessScope } from '~/modules/data-scope';

import {
  assertScopedWriteAffected,
  createScopedRepository,
} from '~/modules/data-scope';
import { FileStorageService } from '~/modules/file-storage';
import { MetricRefreshQueue } from '~/modules/metric-refresh';
import { QualityLossIndexQueue } from '~/modules/quality-loss';
import { SystemLogService } from '~/modules/system-log';
import { BusinessError } from '~/utils/business-error';
import prisma from '~/utils/prisma';

/**
 * Soft-delete an after-sales record (OPTIMISTIC-LOCK-001).
 *
 * A user delete carries the version the client read, so a stale delete can
 * never remove a newer edit: the updateMany is keyed by `{ id, version }`
 * plus the resolved DataScope and only then classified as 404 (missing /
 * out of scope) or 409 (stale version). System cleanup paths omit the version
 * (undefined) and stay force-delete through the plain scoped update.
 */
export async function deleteAfterSalesRecord(
  id: string,
  userId: string,
  scope?: AccessScope,
  expectedVersion?: number,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const txRepo = createScopedRepository('after-sales', tx.after_sales);
    const access = {
      user: {
        id: userId,
      },
      scope,
    };
    const current = await txRepo.findAccessible(
      {
        where: { id, isDeleted: false },
        select: { id: true, supplierBrandId: true },
      },
      access,
    );
    if (!current) {
      throw new BusinessError('NOT_FOUND', '售后记录不存在', 404);
    }
    const result =
      expectedVersion === undefined
        ? await txRepo.updateAccessible(
            {
              where: { id },
              data: {
                isDeleted: true,
                updatedAt: new Date(),
              },
            },
            access,
          )
        : await txRepo.updateAccessibleVersioned(
            {
              where: { id },
              data: {
                isDeleted: true,
                updatedAt: new Date(),
              },
            },
            access,
            expectedVersion,
          );
    if (result.count === 0 && expectedVersion !== undefined) {
      const exists = await txRepo.findAccessible(
        { where: { id, isDeleted: false }, select: { id: true } },
        access,
      );
      if (!exists) {
        throw new BusinessError('NOT_FOUND', '售后记录不存在', 404);
      }
      throw new BusinessError(
        'OPTIMISTIC_LOCK_CONFLICT',
        '记录已被其他用户修改，请刷新后重试',
        409,
      );
    }
    assertScopedWriteAffected(result.count, '售后记录');
    await MetricRefreshQueue.enqueueSupplierScores(
      tx,
      [current.supplierBrandId],
      'after-sales.deleted',
    );
    await QualityLossIndexQueue.enqueue(
      tx,
      [{ source: 'EXTERNAL', sourcePk: id }],
      'after-sales.deleted',
    );
  });

  await FileStorageService.softDeleteReferences({
    bizId: id,
    bizType: 'after_sales',
  });

  // Record audit log
  await SystemLogService.auditLog('after-sales', 'delete', {
    userId,
    targetId: id,
    detailsVariables: {},
  });
}
