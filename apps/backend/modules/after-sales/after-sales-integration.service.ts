import type { AnalyticsAccessContext } from '~/modules/data-scope';

import { Prisma } from '@prisma/client';
import { DataScopeService, requireAnalyticsUser } from '~/modules/data-scope';
import { MetricRefreshQueue } from '~/modules/metric-refresh';
import { QualityLossIndexQueue } from '~/modules/quality-loss';
import prisma from '~/utils/prisma';

async function buildScopedAfterSalesWhere(
  baseWhere: Prisma.after_salesWhereInput,
  access: AnalyticsAccessContext,
): Promise<Prisma.after_salesWhereInput> {
  const user = requireAnalyticsUser(access);
  return DataScopeService.buildAfterSalesWhere(
    baseWhere,
    user,
    access.dataScope,
  );
}

function buildAfterSalesVehicleDivisionWhere(vehicleDeptIds: string[]) {
  const divisions = vehicleDeptIds.filter(Boolean);
  if (divisions.length > 0) {
    return {
      OR: [
        { division: { in: divisions } },
        {
          AND: [
            { division: { contains: '车辆' as const } },
            { division: { contains: 'SOBU' as const } },
          ],
        },
      ],
    };
  }
  return {
    AND: [
      { division: { contains: '车辆' as const } },
      { division: { contains: 'SOBU' as const } },
    ],
  };
}

function buildVehicleFailureSourceWhere(params: {
  productCategoryId: null | string;
  productTypeSnapshots: string[];
  vehicleDeptIds: string[];
}): Prisma.after_salesWhereInput {
  const productCategoryId = params.productCategoryId?.trim();
  const productTypeSnapshots = [
    ...new Set(params.productTypeSnapshots.map((name) => name.trim())),
  ].filter(Boolean);

  return {
    OR: [
      ...(productCategoryId ? [{ productCategoryId }] : []),
      ...(productTypeSnapshots.length > 0
        ? [{ productType: { in: productTypeSnapshots } }]
        : []),
      {
        work_orders: {
          ...buildAfterSalesVehicleDivisionWhere(params.vehicleDeptIds),
          isDeleted: false,
        },
      },
    ],
  };
}

export const AfterSalesIntegrationService = {
  async findIdBySerialNumber(serialNumber: number) {
    const row = await prisma.after_sales.findFirst({
      where: { serialNumber },
      select: { id: true },
    });
    return row?.id || null;
  },

  async updateQualityLossFields(params: { actualClaim?: number; id: string }) {
    await prisma.$transaction(async (tx) => {
      const current = await tx.after_sales.findUnique({
        where: { id: params.id },
        select: { supplierBrandId: true },
      });
      // qms-arch-allow R-SCOPE: quality-loss sync side effect; the record id
      // derives from an already-authorized after-sales mutation.
      const updated = await tx.after_sales.update({
        where: { id: params.id },
        data: {
          actualClaim: params.actualClaim,
          updatedAt: new Date(),
        },
      });
      await MetricRefreshQueue.enqueueSupplierScores(
        tx,
        [current?.supplierBrandId, updated.supplierBrandId],
        'after-sales.quality-loss-updated',
      );
      await QualityLossIndexQueue.enqueue(
        tx,
        [{ source: 'EXTERNAL', sourcePk: updated.id }],
        'after-sales.quality-loss-updated',
      );
    });
  },

  async getSupplierScoringData(params: { since: Date; supplierIds: string[] }) {
    const supplierIds = params.supplierIds.filter(Boolean);
    const supplierWhere = { supplierBrandId: { in: supplierIds } };

    const [stats, statusStats, records] = await Promise.all([
      prisma.after_sales.groupBy({
        by: ['supplierBrandId'],
        where: {
          ...supplierWhere,
          isDeleted: false,
          occurDate: { gte: params.since },
        },
        _sum: { materialCost: true, laborTravelCost: true },
        _count: { id: true },
      }),
      prisma.after_sales.groupBy({
        by: ['supplierBrandId', 'claimStatus'],
        where: {
          ...supplierWhere,
          isDeleted: false,
          occurDate: { gte: params.since },
        },
        _count: { id: true },
      }),
      prisma.after_sales.findMany({
        where: {
          ...supplierWhere,
          isDeleted: false,
          occurDate: { gte: params.since },
        },
        select: {
          supplierBrandId: true,
          supplierBrand: true,
          materialCost: true,
          laborTravelCost: true,
          severity: true,
          occurDate: true,
        },
        orderBy: { occurDate: 'desc' },
      }),
    ]);

    return { records, stats, statusStats };
  },

  async getWeeklyReportIssues(
    params: { end: Date; start: Date },
    access: AnalyticsAccessContext,
  ) {
    const where = await buildScopedAfterSalesWhere(
      {
        isDeleted: false,
        occurDate: { gte: params.start, lte: params.end },
      },
      access,
    );
    return prisma.after_sales.findMany({
      where,
    });
  },

  async getVehicleFailureRecords(params: {
    end: Date;
    productCategoryId: null | string;
    productTypeSnapshots: string[];
    start: Date;
    vehicleDeptIds: string[];
  }) {
    return prisma.after_sales.findMany({
      select: {
        defectCategoryId: true,
        defectType: true,
        occurDate: true,
      },
      where: {
        isDeleted: false,
        occurDate: { gte: params.start, lte: params.end },
        ...buildVehicleFailureSourceWhere(params),
      },
    });
  },

  async findEarliestVehicleFailureDate(params: {
    end: Date;
    productCategoryId: null | string;
    productTypeSnapshots: string[];
    vehicleDeptIds: string[];
  }) {
    const row = await prisma.after_sales.findFirst({
      orderBy: { occurDate: 'asc' },
      select: { occurDate: true },
      where: {
        isDeleted: false,
        occurDate: { lte: params.end },
        ...buildVehicleFailureSourceWhere(params),
      },
    });
    return row?.occurDate || null;
  },

  async getReportPeriodMetrics(
    params: { end: Date; start: Date },
    access: AnalyticsAccessContext,
  ): Promise<{
    grossCost: number;
    netLoss: number;
    recovered: number;
  }> {
    const where = await buildScopedAfterSalesWhere(
      {
        occurDate: { gte: params.start, lte: params.end },
        isDeleted: false,
      },
      access,
    );
    const aggregate = await prisma.after_sales.aggregate({
      _sum: {
        actualClaim: true,
        laborTravelCost: true,
        materialCost: true,
      },
      where,
    });
    const grossCost =
      Number(aggregate._sum.materialCost || 0) +
      Number(aggregate._sum.laborTravelCost || 0);
    const recovered = Number(aggregate._sum.actualClaim || 0);
    return {
      grossCost,
      recovered,
      netLoss: grossCost - recovered,
    };
  },

  async getStatsForDashboard(
    params: { weekStart: Date; yearStart: Date },
    access: AnalyticsAccessContext,
  ) {
    const baseWhere = { isDeleted: false };
    const yearWhere = await buildScopedAfterSalesWhere(
      { ...baseWhere, occurDate: { gte: params.yearStart } },
      access,
    );
    const weekWhere = await buildScopedAfterSalesWhere(
      { ...baseWhere, occurDate: { gte: params.weekStart } },
      access,
    );
    const [yearAggregate, weekAggregate, weekCount] = await Promise.all([
      prisma.after_sales.aggregate({
        where: yearWhere,
        _count: { id: true },
        _sum: { materialCost: true, laborTravelCost: true },
      }),
      prisma.after_sales.aggregate({
        where: weekWhere,
        _sum: { materialCost: true, laborTravelCost: true },
      }),
      prisma.after_sales.count({
        where: weekWhere,
      }),
    ]);

    return {
      totalCount: yearAggregate._count.id || 0,
      weeklyCount: weekCount || 0,
      totalLoss:
        Number(yearAggregate._sum.materialCost || 0) +
        Number(yearAggregate._sum.laborTravelCost || 0),
      weeklyLoss:
        Number(weekAggregate._sum.materialCost || 0) +
        Number(weekAggregate._sum.laborTravelCost || 0),
    };
  },
};
