import { Prisma } from '@prisma/client';
import { AfterSalesService } from '~/modules/after-sales/after-sales.service';
import { InspectionService } from '~/modules/inspection/inspection.service';
import { QualityLossIndexService } from '~/modules/quality-loss/quality-loss-index.service';
import { SystemLogService } from '~/modules/system-log/system-log.service';
import { VehicleCommissioningService } from '~/modules/vehicle-commissioning/vehicle-commissioning.service';
import prisma from '~/utils/prisma';

export const QualityLossRecordMaintenanceService = {
  async deleteRecord(id: string, userId: string): Promise<void> {
    const target = await prisma.quality_losses.findFirst({
      where: {
        isDeleted: false,
        OR: [{ id }, { lossId: id }],
      },
      select: { id: true },
    });

    if (!target) {
      const notFoundError = new Error(
        'Quality loss record not found',
      ) as Error & {
        code?: string;
      };
      notFoundError.code = 'NOT_FOUND';
      throw notFoundError;
    }

    await prisma.quality_losses.update({
      where: { id: target.id },
      data: { isDeleted: true },
    });
    await QualityLossIndexService.softDeleteSource('Manual', target.id);

    await SystemLogService.auditLog('quality-loss', 'delete', {
      userId,
      targetId: target.id,
      detailsVariables: {},
    });
  },

  async batchDelete(
    ids: string[],
    userId: string,
  ): Promise<Prisma.BatchPayload> {
    const normalizedIds = [
      ...new Set(ids.map((item) => String(item).trim()).filter(Boolean)),
    ];
    if (normalizedIds.length === 0) return { count: 0 };

    const targets = await prisma.quality_losses.findMany({
      where: {
        isDeleted: false,
        OR: [{ id: { in: normalizedIds } }, { lossId: { in: normalizedIds } }],
      },
      select: { id: true },
    });

    if (targets.length === 0) return { count: 0 };

    const targetIds = targets.map((target) => target.id);
    const result = await prisma.quality_losses.updateMany({
      where: { id: { in: targetIds } },
      data: { isDeleted: true },
    });
    await QualityLossIndexService.softDeleteSourceMany('Manual', targetIds);

    await SystemLogService.auditLog('quality-loss', 'batchDelete', {
      userId,
      targetId: normalizedIds.join(','),
      detailsVariables: {
        count: result.count,
      },
    });

    return result;
  },

  async getDrillDown(start: Date, end: Date) {
    const [manualLosses, internalLosses, externalLosses, commissioningLosses] =
      await Promise.all([
        prisma.quality_losses.findMany({
          where: {
            isDeleted: false,
            occurDate: { gte: start, lte: end },
          },
          orderBy: { occurDate: 'desc' },
          take: 500,
        }),
        InspectionService.getQualityLossDrillDownRecords({
          start,
          end,
          take: 500,
        }),
        AfterSalesService.getQualityLossDrillDownRecords({
          start,
          end,
          take: 500,
        }),
        VehicleCommissioningService.getQualityLossDrillDownRecords({
          start,
          end,
          take: 500,
        }),
      ]);

    return {
      manualLosses,
      internalLosses,
      externalLosses,
      commissioningLosses,
    };
  },
};
