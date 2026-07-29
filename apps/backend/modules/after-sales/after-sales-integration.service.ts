import { Prisma } from '@prisma/client';
import { MetricRefreshQueue } from '~/modules/metric-refresh';
import { QualityLossIndexService } from '~/modules/quality-loss/quality-loss-index.service';
import prisma from '~/utils/prisma';

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
    const updated = await prisma.$transaction(async (tx) => {
      const current = await tx.after_sales.findUnique({
        where: { id: params.id },
        select: { supplierBrandId: true },
      });
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
      return updated;
    });
    await QualityLossIndexService.upsertFromAfterSales(updated);
  },

  async getQualityLossTrendRows(params: {
    granularity: 'month' | 'week';
    year: number;
  }) {
    return params.granularity === 'week'
      ? prisma.$queryRaw<
          Array<{
            a: bigint | null | number | Prisma.Decimal;
            p: bigint | number;
          }>
        >`SELECT WEEK(occurDate, 3) as p, SUM(IFNULL(materialCost, 0) + IFNULL(laborTravelCost, 0)) as a FROM after_sales WHERE YEAR(occurDate) = ${params.year} AND isDeleted = 0 GROUP BY p`
      : prisma.$queryRaw<
          Array<{
            a: bigint | null | number | Prisma.Decimal;
            p: bigint | number;
          }>
        >`SELECT MONTH(occurDate) as p, SUM(IFNULL(materialCost, 0) + IFNULL(laborTravelCost, 0)) as a FROM after_sales WHERE YEAR(occurDate) = ${params.year} AND isDeleted = 0 GROUP BY p`;
  },

  async getLossRecordsForAggregation(params?: {
    skip?: number;
    take?: number;
    workOrderNumber?: string;
  }) {
    return prisma.after_sales.findMany({
      where: {
        isDeleted: false,
        ...(params?.workOrderNumber
          ? { workOrderNumber: { contains: params.workOrderNumber } }
          : {}),
      },
      orderBy: { occurDate: 'desc' },
      ...(params?.skip === undefined ? {} : { skip: params.skip }),
      ...(params?.take === undefined ? {} : { take: params.take }),
    });
  },

  async countLossRecordsForAggregation(params?: { workOrderNumber?: string }) {
    return prisma.after_sales.count({
      where: {
        isDeleted: false,
        ...(params?.workOrderNumber
          ? { workOrderNumber: { contains: params.workOrderNumber } }
          : {}),
      },
    });
  },

  async getQualityLossDrillDownRecords(params: {
    end: Date;
    start: Date;
    take?: number;
  }) {
    return prisma.after_sales.findMany({
      where: {
        isDeleted: false,
        occurDate: { gte: params.start, lte: params.end },
      },
      orderBy: { occurDate: 'desc' },
      take: params.take || 500,
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

  async getWeeklyReportIssues(params: { end: Date; start: Date }) {
    return prisma.after_sales.findMany({
      where: {
        isDeleted: false,
        occurDate: { gte: params.start, lte: params.end },
      },
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

  async getReportPeriodMetrics(params: { end: Date; start: Date }): Promise<{
    grossCost: number;
    netLoss: number;
    recovered: number;
  }> {
    const aggregate = await prisma.after_sales.aggregate({
      _sum: {
        actualClaim: true,
        laborTravelCost: true,
        materialCost: true,
      },
      where: {
        occurDate: { gte: params.start, lte: params.end },
        isDeleted: false,
      },
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

  async getStatsForDashboard(params: { weekStart: Date; yearStart: Date }) {
    const baseWhere = { isDeleted: false };
    const [yearAggregate, weekAggregate, weekCount] = await Promise.all([
      prisma.after_sales.aggregate({
        where: { ...baseWhere, occurDate: { gte: params.yearStart } },
        _count: { id: true },
        _sum: { materialCost: true, laborTravelCost: true },
      }),
      prisma.after_sales.aggregate({
        where: { ...baseWhere, occurDate: { gte: params.weekStart } },
        _sum: { materialCost: true, laborTravelCost: true },
      }),
      prisma.after_sales.count({
        where: { ...baseWhere, occurDate: { gte: params.weekStart } },
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
