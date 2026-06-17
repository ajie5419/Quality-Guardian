import { Prisma } from '@prisma/client';
import { toAfterSalesClaimStatus } from '~/modules/quality-loss/quality-loss-status';
import prisma from '~/utils/prisma';

async function refreshSupplierScoreSnapshots(names: unknown[]) {
  const supplierNames = names
    .map((name) => String(name || '').trim())
    .filter(Boolean);
  if (supplierNames.length === 0) return;
  const { SupplierScoreSnapshotService } = await import('~/modules/supplier');
  await SupplierScoreSnapshotService.refreshBySupplierNames(supplierNames);
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

export const AfterSalesIntegrationService = {
  async findIdBySerialNumber(serialNumber: number) {
    const row = await prisma.after_sales.findFirst({
      where: { serialNumber },
      select: { id: true },
    });
    return row?.id || null;
  },

  async updateQualityLossFields(params: {
    actualClaim?: number;
    id: string;
    status?: string;
  }) {
    const current = await prisma.after_sales.findUnique({
      where: { id: params.id },
      select: { supplierBrand: true },
    });
    await prisma.after_sales.update({
      where: { id: params.id },
      data: {
        actualClaim: params.actualClaim,
        ...(params.status
          ? { claimStatus: toAfterSalesClaimStatus(params.status) }
          : {}),
        updatedAt: new Date(),
      },
    });
    await refreshSupplierScoreSnapshots([current?.supplierBrand]);
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

  async getSupplierScoringData(params: {
    since: Date;
    supplierNames: string[];
  }) {
    const [stats, statusStats, records] = await Promise.all([
      prisma.after_sales.groupBy({
        by: ['supplierBrand'],
        where: {
          supplierBrand: { in: params.supplierNames },
          isDeleted: false,
          occurDate: { gte: params.since },
        },
        _sum: { materialCost: true, laborTravelCost: true },
        _count: { id: true },
      }),
      prisma.after_sales.groupBy({
        by: ['supplierBrand', 'claimStatus'],
        where: {
          supplierBrand: { in: params.supplierNames },
          isDeleted: false,
          occurDate: { gte: params.since },
        },
        _count: { id: true },
      }),
      prisma.after_sales.findMany({
        where: {
          supplierBrand: { in: params.supplierNames },
          isDeleted: false,
          occurDate: { gte: params.since },
        },
        select: {
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
    productType: string;
    start: Date;
    vehicleDeptIds: string[];
  }) {
    return prisma.after_sales.findMany({
      select: { defectType: true, defectTypeId: true, occurDate: true },
      where: {
        isDeleted: false,
        occurDate: { gte: params.start, lte: params.end },
        OR: [
          { productType: params.productType },
          {
            work_orders: {
              ...buildAfterSalesVehicleDivisionWhere(params.vehicleDeptIds),
              isDeleted: false,
            },
          },
        ],
      },
    });
  },

  async findEarliestVehicleFailureDate(params: {
    end: Date;
    productType: string;
    vehicleDeptIds: string[];
  }) {
    const row = await prisma.after_sales.findFirst({
      orderBy: { occurDate: 'asc' },
      select: { occurDate: true },
      where: {
        isDeleted: false,
        occurDate: { lte: params.end },
        OR: [
          { productType: params.productType },
          {
            work_orders: {
              ...buildAfterSalesVehicleDivisionWhere(params.vehicleDeptIds),
              isDeleted: false,
            },
          },
        ],
      },
    });
    return row?.occurDate || null;
  },

  async getReportPeriodMetrics(params: { end: Date; start: Date }) {
    const aggregate = await prisma.after_sales.aggregate({
      _sum: { materialCost: true, laborTravelCost: true },
      where: {
        occurDate: { gte: params.start, lte: params.end },
        isDeleted: false,
      },
    });
    return {
      externalLoss:
        Number(aggregate._sum.materialCost || 0) +
        Number(aggregate._sum.laborTravelCost || 0),
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
