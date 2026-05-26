import type { after_sales_claimStatus } from '@prisma/client';
import type {
  AfterSalesItem,
  AfterSalesParams,
  AfterSalesStats,
} from '@qgs/shared';
import type { ResolvedDataScope } from '~/modules/data-scope/data-scope.service';

import type { AfterSalesDateMode } from './after-sales-query';

import { Prisma } from '@prisma/client';
import {
  formatDate,
  QMS_DEFAULT_VALUES,
  QMS_STATUS_OPEN_SET,
  tryParsePhotos,
} from '@qgs/shared';
import { DataScopeService } from '~/modules/data-scope/data-scope.service';
import { DeptService } from '~/modules/dept/dept.service';
import { FileStorageService } from '~/modules/file-storage/file-storage.service';
import { SystemLogService } from '~/modules/system-log/system-log.service';
import { flattenDeptTree } from '~/utils/dept-tree';
import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';
import { toAfterSalesClaimStatus } from '~/utils/quality-loss-status';

import { buildGovernedAfterSalesUpdateData } from './after-sales-payload';
import { buildAfterSalesDateRange } from './after-sales-query';

// 创建模块级 logger
const logger = createModuleLogger('AfterSalesService');

type AfterSalesChartAggregateItem = {
  name: string;
  value: number;
};

type AfterSalesChartDimension =
  | 'defectSubtype'
  | 'defectType'
  | 'productSubtype'
  | 'productType'
  | 'reportMonth'
  | 'responsibleDept'
  | 'severity'
  | 'status'
  | 'supplierBrand';

type AfterSalesChartMetric =
  | 'count'
  | 'laborTravelCost'
  | 'materialCost'
  | 'quantity'
  | 'runningHours'
  | 'totalLoss';

type TrendResultYear = {
  closed: bigint;
  costs: number;
  issues: bigint;
  period: number;
};

type TrendResultDay = {
  closed: bigint;
  costs: number;
  issues: bigint;
  period: Date;
};

const AFTER_SALES_CLAIM_STATUS_VALUES = new Set<string>([
  'CANCELLED',
  'CLOSED',
  'COMPLETED',
  'IN_PROGRESS',
  'NEGOTIATING',
  'OPEN',
  'RESOLVED',
  'SUBMITTED',
]);

function isAfterSalesClaimStatus(
  value: string,
): value is after_sales_claimStatus {
  return AFTER_SALES_CLAIM_STATUS_VALUES.has(value);
}

function normalizeAfterSalesClaimStatus(
  value: unknown,
): after_sales_claimStatus | undefined {
  const normalized = String(value || '')
    .trim()
    .toUpperCase();
  return isAfterSalesClaimStatus(normalized) ? normalized : undefined;
}

function getMetricValueFromRow(
  metric: AfterSalesChartMetric,
  row: {
    laborTravelCost: null | number | Prisma.Decimal;
    materialCost: null | number | Prisma.Decimal;
    quantity: null | number | Prisma.Decimal;
    runningHours: null | number | Prisma.Decimal;
  },
) {
  switch (metric) {
    case 'count': {
      return 1;
    }
    case 'laborTravelCost': {
      return Number(row.laborTravelCost || 0);
    }
    case 'materialCost': {
      return Number(row.materialCost || 0);
    }
    case 'quantity': {
      return Number(row.quantity || 0);
    }
    case 'runningHours': {
      return Number(row.runningHours || 0);
    }
    default: {
      return Number(row.materialCost || 0) + Number(row.laborTravelCost || 0);
    }
  }
}

function getMetricValueFromGroupedItem(
  metric: AfterSalesChartMetric,
  item: any,
) {
  switch (metric) {
    case 'count': {
      return Number(item._count?.id || 0);
    }
    case 'laborTravelCost': {
      return Number(item._sum?.laborTravelCost || 0);
    }
    case 'materialCost': {
      return Number(item._sum?.materialCost || 0);
    }
    case 'quantity': {
      return Number(item._sum?.quantity || 0);
    }
    case 'runningHours': {
      return Number(item._sum?.runningHours || 0);
    }
    default: {
      return (
        Number(item._sum?.materialCost || 0) +
        Number(item._sum?.laborTravelCost || 0)
      );
    }
  }
}

function buildKpiSummary(input: {
  kpiAggregate: {
    _count: { id: null | number };
    _sum: {
      laborTravelCost: null | number | Prisma.Decimal;
      materialCost: null | number | Prisma.Decimal;
    };
  };
  openCount: number;
  resolvedStats: Array<{ avgDays: number }>;
}) {
  const total = input.kpiAggregate._count.id || 0;
  const totalCost =
    (Number(input.kpiAggregate._sum.materialCost) || 0) +
    (Number(input.kpiAggregate._sum.laborTravelCost) || 0);
  const avgTime = Number(input.resolvedStats?.[0]?.avgDays) || 0;
  return {
    avgTime: Number(avgTime.toFixed(1)),
    cost: Number(totalCost.toFixed(2)),
    open: input.openCount,
    total,
  };
}

function buildTrendData(input: {
  isYearMode: boolean;
  months: string[];
  startDate: Date;
  trendResults: TrendResultDay[] | TrendResultYear[];
}) {
  const monthlyIssues: number[] = Array.from(
    { length: input.months.length },
    () => 0,
  );
  const monthlyClosed: number[] = Array.from(
    { length: input.months.length },
    () => 0,
  );
  const monthlyCosts: number[] = Array.from(
    { length: input.months.length },
    () => 0,
  );
  if (input.isYearMode) {
    (input.trendResults as TrendResultYear[]).forEach((r) => {
      const mIdx = Number(r.period) - input.startDate.getMonth() - 1;
      if (mIdx < 0 || mIdx >= input.months.length) return;
      monthlyIssues[mIdx] = Number(r.issues);
      monthlyClosed[mIdx] = Number(r.closed);
      monthlyCosts[mIdx] = Number(r.costs.toFixed(2));
    });
  } else {
    const periodMap = new Map<string, TrendResultDay>(
      (input.trendResults as TrendResultDay[]).map((item) => [
        formatDate(item.period).slice(0, 10),
        item,
      ]),
    );
    input.months.forEach((_, index) => {
      const date = new Date(input.startDate);
      date.setDate(input.startDate.getDate() + index);
      const key = formatDate(date).slice(0, 10);
      const item = periodMap.get(key);
      if (!item) return;
      monthlyIssues[index] = Number(item.issues);
      monthlyClosed[index] = Number(item.closed);
      monthlyCosts[index] = Number(item.costs.toFixed(2));
    });
  }
  return {
    category: input.months,
    closed: monthlyClosed,
    costs: monthlyCosts,
    issues: monthlyIssues,
  };
}

function formatStatsResponse(input: {
  defectStats: Array<{ _count: { id: number }; defectType: null | string }>;
  deptStats: Array<{ _count: { id: number }; respDept: null | string }>;
  kpi: { avgTime: number; cost: number; open: number; total: number };
  months: string[];
  supplierStats: Array<{
    _count: { id: number };
    supplierBrand: null | string;
  }>;
  trend: {
    category: string[];
    closed: number[];
    costs: number[];
    issues: number[];
  };
}) {
  return {
    kpi: input.kpi,
    trend: input.trend,
    defectDistribution: input.defectStats.map((s) => ({
      name: s.defectType || QMS_DEFAULT_VALUES.UNCLASSIFIED,
      value: s._count.id,
    })),
    supplierRanking: {
      categories: input.supplierStats.map((s) => s.supplierBrand || 'Unknown'),
      data: input.supplierStats.map((s) => s._count.id),
    },
    deptDistribution: input.deptStats.map((s) => ({
      name: s.respDept || QMS_DEFAULT_VALUES.UNASSIGNED,
      value: s._count.id,
    })),
  } as AfterSalesStats;
}

const CHART_DB_FIELD_MAP: Record<
  Exclude<AfterSalesChartDimension, 'reportMonth'>,
  | 'claimStatus'
  | 'defectSubtype'
  | 'defectType'
  | 'productSubtype'
  | 'productType'
  | 'respDept'
  | 'severity'
  | 'supplierBrand'
> = {
  defectSubtype: 'defectSubtype',
  defectType: 'defectType',
  productSubtype: 'productSubtype',
  productType: 'productType',
  responsibleDept: 'respDept',
  severity: 'severity',
  status: 'claimStatus',
  supplierBrand: 'supplierBrand',
};

async function buildDeptNameMap() {
  const deptTree = await DeptService.findAll().catch(() => []);
  const deptMap = new Map<string, string>();
  for (const node of flattenDeptTree(deptTree)) deptMap.set(node.id, node.name);
  return deptMap;
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

export const AfterSalesService = {
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

  async updateByRoute(
    id: string,
    bodyRecord: Record<string, unknown>,
  ): Promise<void> {
    const { costsChanged, data: updateData } =
      await buildGovernedAfterSalesUpdateData(bodyRecord);

    if (costsChanged) {
      const current = await prisma.after_sales.findUnique({
        where: { id },
        select: { laborTravelCost: true, materialCost: true },
      });
      if (!current) {
        throw new Error('AFTER_SALES_NOT_FOUND');
      }

      const materialCost = Number(
        updateData.materialCost ?? current.materialCost ?? 0,
      );
      const laborTravelCost = Number(
        updateData.laborTravelCost ?? current.laborTravelCost ?? 0,
      );
      updateData.qualityLoss = materialCost + laborTravelCost;
    }

    await prisma.after_sales.update({
      where: { id },
      data: updateData,
    });
  },

  /**
   * Calculate After-Sales KPI and Statistics
   */
  async getStats(params?: {
    dateMode?: AfterSalesDateMode;
    dateValue?: string;
    year?: number;
  }): Promise<AfterSalesStats> {
    const { start: startDate, end } = buildAfterSalesDateRange({
      dateMode: params?.dateMode,
      dateValue: params?.dateValue,
      year: params?.year,
    });
    const endDate = new Date(end.getTime() - 1);
    const isYearMode = (params?.dateMode || 'year') === 'year';
    const months = isYearMode
      ? Array.from(
          { length: endDate.getMonth() - startDate.getMonth() + 1 },
          (_, i) => `${startDate.getMonth() + i + 1}月`,
        )
      : Array.from(
          {
            length: Math.max(
              1,
              Math.round((end.getTime() - startDate.getTime()) / 86_400_000),
            ),
          },
          (_, i) => {
            const date = new Date(startDate);
            date.setDate(startDate.getDate() + i);
            return `${date.getMonth() + 1}-${date.getDate()}`;
          },
        );
    const baseWhere = {
      isDeleted: false,
      occurDate: { gte: startDate, lte: endDate },
    };

    try {
      const openStatus = [...QMS_STATUS_OPEN_SET]
        .map((status) => normalizeAfterSalesClaimStatus(status))
        .filter(Boolean);

      // 1. KPI & Basic Aggregations
      const [kpiAggregate, openCount, resolvedStats] = await Promise.all([
        prisma.after_sales.aggregate({
          where: baseWhere,
          _count: { id: true },
          _sum: { materialCost: true, laborTravelCost: true },
        }),
        prisma.after_sales.count({
          where: { ...baseWhere, claimStatus: { in: openStatus } },
        }),
        // Average Resolution Time using Raw Query
        prisma.$queryRaw<Array<{ avgDays: number }>>`
          SELECT AVG(DATEDIFF(closeDate, occurDate)) as avgDays 
          FROM after_sales 
          WHERE isDeleted = 0 AND occurDate >= ${startDate} AND occurDate <= ${endDate} 
          AND closeDate IS NOT NULL
        `,
      ]);

      // 2. Distributions (Defect, Supplier, Dept)
      const [defectStats, supplierStats, deptStats] = await Promise.all([
        prisma.after_sales.groupBy({
          by: ['defectType'],
          where: baseWhere,
          _count: { id: true },
        }),
        prisma.after_sales.groupBy({
          by: ['supplierBrand'],
          where: baseWhere,
          _count: { id: true },
          orderBy: { _count: { id: 'desc' } },
          take: 5,
        }),
        prisma.after_sales.groupBy({
          by: ['respDept'],
          where: baseWhere,
          _count: { id: true },
          orderBy: { _count: { id: 'desc' } },
        }),
      ]);

      // 3. Trend Analysis (Monthly) - Use Raw Query for efficiency
      const trendResults = isYearMode
        ? await prisma.$queryRaw<
            Array<{
              closed: bigint;
              costs: number;
              issues: bigint;
              period: number;
            }>
          >`
            SELECT 
              MONTH(occurDate) as period,
              COUNT(*) as issues,
              SUM(IFNULL(materialCost, 0) + IFNULL(laborTravelCost, 0)) as costs,
              SUM(
                CASE
                  WHEN closeDate IS NOT NULL AND closeDate >= ${startDate} AND closeDate <= ${endDate}
                  THEN 1 ELSE 0
                END
              ) as closed
            FROM after_sales
            WHERE isDeleted = 0 AND occurDate >= ${startDate} AND occurDate <= ${endDate}
            GROUP BY period
          `
        : await prisma.$queryRaw<
            Array<{
              closed: bigint;
              costs: number;
              issues: bigint;
              period: Date;
            }>
          >`
            SELECT 
              DATE(occurDate) as period,
              COUNT(*) as issues,
              SUM(IFNULL(materialCost, 0) + IFNULL(laborTravelCost, 0)) as costs,
              SUM(
                CASE
                  WHEN closeDate IS NOT NULL AND DATE(closeDate) = DATE(occurDate)
                  THEN 1 ELSE 0
                END
              ) as closed
            FROM after_sales
            WHERE isDeleted = 0 AND occurDate >= ${startDate} AND occurDate <= ${endDate}
            GROUP BY period
          `;

      const kpi = buildKpiSummary({ kpiAggregate, openCount, resolvedStats });
      const trend = buildTrendData({
        isYearMode,
        months,
        startDate,
        trendResults: trendResults as TrendResultDay[] | TrendResultYear[],
      });
      return formatStatsResponse({
        defectStats,
        deptStats,
        kpi,
        months,
        supplierStats,
        trend,
      });
    } catch (error) {
      logger.error({ err: error, params }, 'getStats failed');
      const emptyMonthly = (): number[] =>
        Array.from({ length: months.length }, () => 0);
      return {
        kpi: { total: 0, open: 0, cost: 0, avgTime: 0 },
        trend: {
          category: months,
          issues: emptyMonthly(),
          closed: emptyMonthly(),
          costs: emptyMonthly(),
        },
        defectDistribution: [],
        supplierRanking: { categories: [], data: [] },
        deptDistribution: [],
      };
    }
  },

  async getChartAggregation(params: {
    dataScope?: ResolvedDataScope;
    dateMode?: AfterSalesDateMode;
    dateValue?: string;
    dimension: AfterSalesChartDimension;
    metric: AfterSalesChartMetric;
    top?: number;
    userContext?: { userId: string; username?: string };
    year?: number;
  }): Promise<AfterSalesChartAggregateItem[]> {
    const { dateMode, dateValue, dimension, metric, year } = params;
    const { start, end } = buildAfterSalesDateRange({
      dateMode,
      dateValue,
      year,
    });
    let where: Prisma.after_salesWhereInput = {
      isDeleted: false,
      occurDate: { gte: start, lt: end },
    };

    if (params.userContext?.userId) {
      where = await DataScopeService.buildAfterSalesWhere(
        where,
        {
          userId: params.userContext.userId,
          username: params.userContext.username,
        },
        params.dataScope,
      );
    }

    const limit = Math.min(Math.max(Number(params.top) || 15, 1), 50);

    if (dimension === 'reportMonth') {
      const rows = await prisma.after_sales.findMany({
        where,
        select: {
          occurDate: true,
          laborTravelCost: true,
          materialCost: true,
          quantity: true,
          runningHours: true,
        },
      });

      const map = new Map<string, number>();
      for (const row of rows) {
        const key = formatDate(row.occurDate).slice(0, 7);
        const metricValue = getMetricValueFromRow(metric, row);
        map.set(key, (map.get(key) || 0) + metricValue);
      }

      return [...map.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(0, limit)
        .map(([name, value]) => ({
          name,
          value: Number(value.toFixed(2)),
        }));
    }

    const byField = CHART_DB_FIELD_MAP[dimension];
    const metricConfig: Record<
      AfterSalesChartMetric,
      {
        count?: boolean;
        sumFields: Array<
          'laborTravelCost' | 'materialCost' | 'quantity' | 'runningHours'
        >;
      }
    > = {
      count: { count: true, sumFields: [] },
      laborTravelCost: { sumFields: ['laborTravelCost'] },
      materialCost: { sumFields: ['materialCost'] },
      quantity: { sumFields: ['quantity'] },
      runningHours: { sumFields: ['runningHours'] },
      totalLoss: { sumFields: ['laborTravelCost', 'materialCost'] },
    };
    const conf = metricConfig[metric];
    const sumPayload: Record<string, true> = {};
    for (const field of conf.sumFields) {
      sumPayload[field] = true;
    }
    const grouped = await prisma.after_sales.groupBy({
      by: [byField],
      where,
      ...(conf.count ? { _count: { id: true } } : {}),
      ...(conf.sumFields.length > 0 ? { _sum: sumPayload } : {}),
    });

    const deptNameMap =
      dimension === 'responsibleDept' ? await buildDeptNameMap() : null;

    const result = grouped
      .map((item: any) => {
        const rawName = String(
          item[byField] || QMS_DEFAULT_VALUES.UNCLASSIFIED,
        );
        const value = getMetricValueFromGroupedItem(metric, item);
        return {
          name: deptNameMap?.get(rawName) || rawName,
          value: Number(value.toFixed(2)),
        };
      })
      .sort((a, b) => b.value - a.value)
      .slice(0, limit);

    return result;
  },

  /**
   * Get List of After-Sales Records with filtering
   */
  async getList(
    params: AfterSalesParams & {
      dataScope?: ResolvedDataScope;
      dateMode?: AfterSalesDateMode;
      dateValue?: string;
      userContext?: { userId: string; username?: string };
    },
  ): Promise<AfterSalesItem[]> {
    const {
      dateMode,
      dateValue,
      projectName,
      status,
      supplierBrand,
      workOrderNumber,
      year,
    } = params;

    let where: Prisma.after_salesWhereInput = {
      isDeleted: false,
    };

    // Date Logic
    const hasCustomRange = dateMode === 'month' || dateMode === 'week';
    if (year || hasCustomRange) {
      const { start, end } = buildAfterSalesDateRange({
        dateMode,
        dateValue,
        year,
      });
      where.occurDate = {
        gte: start,
        lt: end,
      };
    }

    if (workOrderNumber && String(workOrderNumber).trim() !== '') {
      where.workOrderNumber = {
        contains: String(workOrderNumber).trim(),
      };
    }
    if (projectName && String(projectName).trim() !== '') {
      where.projectName = { contains: String(projectName).trim() };
    }
    if (status && String(status).trim() !== '') {
      const claimStatus = normalizeAfterSalesClaimStatus(status);
      if (claimStatus) {
        where.claimStatus = claimStatus;
      }
    }
    if (supplierBrand && String(supplierBrand).trim() !== '') {
      where.OR = [
        { supplierBrand: { contains: String(supplierBrand).trim() } },
        { projectName: { contains: String(supplierBrand).trim() } },
      ];
    }

    if (params.userContext?.userId) {
      where = await DataScopeService.buildAfterSalesWhere(
        where,
        {
          userId: params.userContext.userId,
          username: params.userContext.username,
        },
        params.dataScope,
      );
    }

    const list = await prisma.after_sales.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    // Map to frontend expectation with formatted dates
    return list.map((item) => {
      const materialCost = Number(item.materialCost) || 0;
      const laborTravelCost = Number(item.laborTravelCost) || 0;

      return {
        ...item,
        issueDate: formatDate(item.occurDate),
        occurDate: formatDate(item.occurDate),
        factoryDate: formatDate(item.factoryDate),
        closeDate: formatDate(item.closeDate),
        shipDate: formatDate(item.shipDate),
        createdAt: formatDate(item.createdAt),
        responsibleDept: item.respDept || '',
        resolutionPlan: item.solution || '',
        status: item.claimStatus,
        isClaim: item.isClaim || false,
        materialCost,
        laborTravelCost,
        qualityLoss: materialCost + laborTravelCost,
        photos: tryParsePhotos(item.photos as string),
        productType: item.productType || '',
        productSubtype: item.productSubtype || '',
        division: item.division || '',
        partName: item.partName || '',
        supplierBrand: item.supplierBrand || '',
        runningHours: Number(item.runningHours) || 0,
      } as AfterSalesItem;
    });
  },

  /**
   * Soft delete a record with audit logging
   */
  async deleteRecord(id: string, userId: string): Promise<void> {
    await prisma.after_sales.update({
      where: { id },
      data: {
        isDeleted: true,
        updatedAt: new Date(),
      },
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
  },
};
