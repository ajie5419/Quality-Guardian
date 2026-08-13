import { defineEventHandler, readBody } from 'h3';
import { z } from 'zod';
import { buildGovernedAfterSalesUpdateData } from '~/modules/after-sales/after-sales-payload';
import { FileStorageService } from '~/modules/file-storage/file-storage.service';
import { MetricRefreshQueue } from '~/modules/metric-refresh';
import { QualityLossIndexQueue } from '~/modules/quality-loss';
import { SystemLogService } from '~/modules/system-log/system-log.service';
import { logApiError } from '~/utils/api-logger';
import { businessErrorResponse, isBusinessError } from '~/utils/business-error';
import { getCurrentUser } from '~/utils/current-user';
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
    const { costsChanged, data: updateData } =
      await buildGovernedAfterSalesUpdateData(bodyRecord);
    const supplierChanged =
      updateData.supplierBrand !== undefined ||
      updateData.supplierBrandId !== undefined;
    await prisma.$transaction(async (tx) => {
      const current =
        costsChanged || supplierChanged
          ? await tx.after_sales.findUnique({
              where: { id },
              select: {
                laborTravelCost: true,
                materialCost: true,
                supplierBrandId: true,
              },
            })
          : null;
      if (costsChanged && !current) {
        throw new Error('AFTER_SALES_NOT_FOUND');
      }
      const updated = await tx.after_sales.update({
        where: { id },
        data: updateData,
      });
      await MetricRefreshQueue.enqueueSupplierScores(
        tx,
        [current?.supplierBrandId, updated.supplierBrandId],
        'after-sales.updated',
      );
      await QualityLossIndexQueue.enqueue(
        tx,
        [{ source: 'EXTERNAL', sourcePk: updated.id }],
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
      detailsVariables: { id },
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
