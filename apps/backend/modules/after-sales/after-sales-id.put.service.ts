import { defineEventHandler, readBody } from 'h3';
import { z } from 'zod';
import { buildGovernedAfterSalesUpdateData } from '~/modules/after-sales/after-sales-payload';
import {
  assertVersionedWriteAffected,
  createScopedRepository,
} from '~/modules/data-scope';
import { FileStorageService } from '~/modules/file-storage/file-storage.service';
import { MetricRefreshQueue } from '~/modules/metric-refresh';
import { QualityLossIndexQueue } from '~/modules/quality-loss';
import { SystemLogService } from '~/modules/system-log/system-log.service';
import { logApiError } from '~/utils/api-logger';
import {
  BusinessError,
  businessErrorResponse,
  isBusinessError,
} from '~/utils/business-error';
import { getCurrentUser } from '~/utils/current-user';
import { requireExpectedVersionBody } from '~/utils/optimistic-lock';
import prisma from '~/utils/prisma';
import { isPrismaNotFoundError } from '~/utils/prisma-error';
import {
  internalServerErrorResponse,
  notFoundResponse,
  useResponseSuccess,
} from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';

const updateAfterSalesSchema = z.record(z.string(), z.unknown());

export default defineEventHandler(async (event) => {
  const userinfo = getCurrentUser(event);

  const id = getRequiredRouterParam(event, 'id', '缺少ID');
  if (typeof id !== 'string') {
    return id;
  }

  try {
    const bodyRecord = updateAfterSalesSchema.parse(await readBody(event));
    const scope = event.context.dataScope;
    const access = {
      user: {
        id: userinfo.id ?? userinfo.userId ?? '',
        username: userinfo.username,
      },
      scope,
    };
    // OPTIMISTIC-LOCK-001: interactive edits must carry the version the client
    // read; a missing version would silently degrade to last-write-wins.
    const expectedVersion = requireExpectedVersionBody(bodyRecord);
    const { data: updateData } =
      await buildGovernedAfterSalesUpdateData(bodyRecord);

    let currentVersion: number | undefined;
    await prisma.$transaction(async (tx) => {
      const txRepo = createScopedRepository('after-sales', tx.after_sales);
      const current = await txRepo.findAccessible(
        {
          where: { id, isDeleted: false },
          select: {
            id: true,
            laborTravelCost: true,
            materialCost: true,
            supplierBrandId: true,
            version: true,
          },
        },
        access,
      );
      if (!current) {
        throw new BusinessError('NOT_FOUND', '售后记录不存在', 404);
      }
      currentVersion = current.version;
      const result = await txRepo.updateAccessibleVersioned(
        { where: { id }, data: updateData },
        access,
        expectedVersion,
      );
      if (result.count === 0) {
        const exists = await txRepo.findAccessible(
          { where: { id, isDeleted: false }, select: { id: true } },
          access,
        );
        assertVersionedWriteAffected(result.count, Boolean(exists), '售后记录');
      }
      const nextBrandId =
        typeof updateData.supplierBrandId === 'string'
          ? updateData.supplierBrandId
          : (updateData.supplierBrandId?.set ?? null);
      await MetricRefreshQueue.enqueueSupplierScores(
        tx,
        [current.supplierBrandId, nextBrandId],
        'after-sales.updated',
      );
      await QualityLossIndexQueue.enqueue(
        tx,
        [{ source: 'EXTERNAL', sourcePk: id }],
        'after-sales.updated',
      );
    });
    if (bodyRecord.photos !== undefined) {
      await FileStorageService.registerReferencesFromAttachments({
        attachments: bodyRecord.photos,
        bizId: String(id),
        bizType: 'after_sales',
        fieldName: 'photos',
      });
    }
    await SystemLogService.auditLog('after-sales', 'update', {
      userId: String(userinfo.id),
      targetId: String(id),
      detailsVariables: {
        id,
        oldVersion: currentVersion,
        newVersion: expectedVersion + 1,
      },
    });

    return useResponseSuccess(null);
  } catch (error: unknown) {
    logApiError('after-sales', error, undefined, event);
    if (isBusinessError(error)) return businessErrorResponse(event, error);
    if (error instanceof Error && error.message === 'AFTER_SALES_NOT_FOUND') {
      return notFoundResponse(event, '售后记录不存在');
    }
    if (isPrismaNotFoundError(error)) {
      return notFoundResponse(event, '售后记录不存在');
    }
    return internalServerErrorResponse(event, '更新售后记录失败');
  }
});
