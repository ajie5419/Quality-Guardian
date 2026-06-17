import { defineEventHandler, readBody } from 'h3';
import { z } from 'zod';
import { buildGovernedAfterSalesUpdateData } from '~/modules/after-sales/after-sales-payload';
import { FileStorageService } from '~/modules/file-storage/file-storage.service';
import { SystemLogService } from '~/modules/system-log/system-log.service';
import { logApiError } from '~/utils/api-logger';
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

async function refreshSupplierScoreSnapshots(names: unknown[]) {
  const supplierNames = names
    .map((name) => String(name || '').trim())
    .filter(Boolean);
  if (supplierNames.length === 0) return;
  const { SupplierScoreSnapshotService } = await import('~/modules/supplier');
  await SupplierScoreSnapshotService.refreshBySupplierNames(supplierNames);
}

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
    const supplierChanged = updateData.supplierBrand !== undefined;
    let previousSupplierBrand: null | string | undefined;

    if (costsChanged || supplierChanged) {
      const current = await prisma.after_sales.findUnique({
        where: { id },
        select: {
          laborTravelCost: true,
          materialCost: true,
          supplierBrand: true,
        },
      });
      if (costsChanged && !current) {
        return notFoundResponse(event, '售后记录不存在');
      }
      previousSupplierBrand = current?.supplierBrand;

      if (costsChanged) {
        const materialCost = Number(
          updateData.materialCost ?? current?.materialCost ?? 0,
        );
        const laborTravelCost = Number(
          updateData.laborTravelCost ?? current?.laborTravelCost ?? 0,
        );
        updateData.qualityLoss = materialCost + laborTravelCost;
      }
    }

    await prisma.after_sales.update({
      where: { id },
      data: updateData,
    });
    await refreshSupplierScoreSnapshots([
      previousSupplierBrand,
      updateData.supplierBrand,
    ]);
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
    if (isPrismaNotFoundError(error)) {
      return notFoundResponse(event, '售后记录不存在');
    }
    return internalServerErrorResponse(event, '更新售后记录失败');
  }
});
