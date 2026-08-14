import type { AfterSalesStats, IdentityAggregateItem } from '@qgs/shared';
import type { ResolvedDataScope } from '~/modules/data-scope/data-scope.service';

import type { AfterSalesDateMode } from './after-sales-query';
import type { AfterSalesStatisticsIdentity } from './after-sales-statistics-identity';

import { Prisma } from '@prisma/client';
import {
  createIdentityAggregateItem,
  formatDate,
  QMS_DEFAULT_VALUES,
  QMS_STATUS_OPEN_SET,
  QUALITY_CLASSIFICATION_SCOPE,
} from '@qgs/shared';
import { DeptService } from '~/modules/dept';
import { QualityClassificationService } from '~/modules/quality-classification';
import { MasterDataGovernanceKernel } from '~/utils/canonical-master-data';
import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';

import { AfterSalesChartAggregationService } from './after-sales-chart-aggregation.service';
import { buildAfterSalesDateRange } from './after-sales-query';
import {
  getAfterSalesStatisticsIdentityKey,
  getAfterSalesStatisticsSnapshotFields,
  resolveAfterSalesStatisticsIdentity,
} from './after-sales-statistics-identity';
import { normalizeAfterSalesClaimStatus } from './after-sales-status';

const logger = createModuleLogger('AfterSalesAnalyticsService');

export type AfterSalesChartAggregateItem = IdentityAggregateItem;

export type AfterSalesChartDimension =
  | 'defectSubtype'
  | 'defectType'
  | 'productSubtype'
  | 'productType'
  | 'reportMonth'
  | 'responsibleDept'
  | 'severity'
  | 'status'
  | 'supplierBrand';

export type AfterSalesChartMetric =
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
  const monthlyIssues = Array.from({ length: input.months.length }, () => 0);
  const monthlyClosed = Array.from({ length: input.months.length }, () => 0);
  const monthlyCosts = Array.from({ length: input.months.length }, () => 0);
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
      const item = periodMap.get(formatDate(date).slice(0, 10));
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

type CountGroup = { _count: { id: number } };

function mergeIdentityCountGroups<T extends CountGroup>(
  rows: T[],
  resolveIdentity: (row: T) => AfterSalesStatisticsIdentity,
) {
  const groups = new Map<
    string,
    { identity: AfterSalesStatisticsIdentity; value: number }
  >();
  for (const row of rows) {
    const identity = resolveIdentity(row);
    const key = getAfterSalesStatisticsIdentityKey(identity);
    const current = groups.get(key);
    groups.set(key, {
      identity,
      value: (current?.value || 0) + row._count.id,
    });
  }
  return [...groups.values()];
}

function requireStatisticsIdentity(
  dimension: 'defectType' | 'responsibleDept' | 'supplierBrand',
  row: Parameters<typeof resolveAfterSalesStatisticsIdentity>[1],
) {
  const identity = resolveAfterSalesStatisticsIdentity(dimension, row);
  if (!identity) {
    throw new TypeError(`Missing statistics identity for ${dimension}`);
  }
  if (!identity.id && !identity.rawName && !identity.missingName) {
    return {
      ...identity,
      missingName:
        dimension === 'defectType'
          ? QMS_DEFAULT_VALUES.UNCLASSIFIED
          : QMS_DEFAULT_VALUES.UNASSIGNED,
    };
  }
  return identity;
}

function toIdentityItems(
  groups: ReturnType<typeof mergeIdentityCountGroups>,
  canonicalNames: Map<string, null | string>,
) {
  return groups
    .map(({ identity, value }) =>
      createIdentityAggregateItem({
        canonicalName: identity.id ? canonicalNames.get(identity.id) : null,
        id: identity.id,
        missingName: identity.missingName,
        rawName: identity.rawName,
        resolutionReason: identity.resolutionReason,
        value,
      }),
    )
    .sort((a, b) => b.value - a.value);
}

function formatStatsResponse(input: {
  canonicalIdById: ReadonlyMap<string, string>;
  defectNames: Map<string, null | string>;
  defectStats: Array<{
    _count: { id: number };
    defectCategoryId: null | string;
    defectType: null | string;
  }>;
  deptNames: Map<string, null | string>;
  deptStats: Array<{
    _count: { id: number };
    respDept: null | string;
    respDeptId: null | string;
  }>;
  kpi: { avgTime: number; cost: number; open: number; total: number };
  supplierNames: Map<string, null | string>;
  supplierStats: Array<{
    _count: { id: number };
    supplierBrand: null | string;
    supplierBrandId: null | string;
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
    defectDistribution: toIdentityItems(
      mergeIdentityCountGroups(input.defectStats, (row) =>
        requireStatisticsIdentity('defectType', row),
      ),
      input.defectNames,
    ),
    supplierRanking: toIdentityItems(
      mergeIdentityCountGroups(input.supplierStats, (row) =>
        requireStatisticsIdentity('supplierBrand', row),
      ),
      input.supplierNames,
    ).slice(0, 5),
    deptDistribution:
      MasterDataGovernanceKernel.mergeResolvedIdentityAggregateItems(
        toIdentityItems(
          mergeIdentityCountGroups(input.deptStats, (row) =>
            requireStatisticsIdentity('responsibleDept', row),
          ),
          input.deptNames,
        ),
        { canonicalIdById: input.canonicalIdById },
      ),
  };
}

function buildAfterSalesMonths(params: {
  end: Date;
  isYearMode: boolean;
  startDate: Date;
}) {
  if (params.isYearMode) {
    const endDate = new Date(params.end.getTime() - 1);
    return Array.from(
      { length: endDate.getMonth() - params.startDate.getMonth() + 1 },
      (_, i) => `${params.startDate.getMonth() + i + 1}月`,
    );
  }

  return Array.from(
    {
      length: Math.max(
        1,
        Math.round(
          (params.end.getTime() - params.startDate.getTime()) / 86_400_000,
        ),
      ),
    },
    (_, i) => {
      const date = new Date(params.startDate);
      date.setDate(params.startDate.getDate() + i);
      return `${date.getMonth() + 1}-${date.getDate()}`;
    },
  );
}

export const AfterSalesAnalyticsService = {
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
    const months = buildAfterSalesMonths({ end, isYearMode, startDate });
    const baseWhere = {
      isDeleted: false,
      occurDate: { gte: startDate, lte: endDate },
    };

    try {
      const openStatus = [...QMS_STATUS_OPEN_SET]
        .map((status) => normalizeAfterSalesClaimStatus(status))
        .filter(Boolean);
      const [kpiAggregate, openCount, resolvedStats] = await Promise.all([
        prisma.after_sales.aggregate({
          where: baseWhere,
          _count: { id: true },
          _sum: { materialCost: true, laborTravelCost: true },
        }),
        prisma.after_sales.count({
          where: { ...baseWhere, claimStatus: { in: openStatus } },
        }),
        prisma.$queryRaw<Array<{ avgDays: number }>>`
          SELECT AVG(DATEDIFF(closeDate, occurDate)) as avgDays 
          FROM after_sales 
          WHERE isDeleted = 0 AND occurDate >= ${startDate} AND occurDate <= ${endDate} 
          AND closeDate IS NOT NULL
        `,
      ]);

      const [defectStats, supplierStats, deptStats] = await Promise.all([
        prisma.after_sales.groupBy({
          by: [
            'defectCategoryId',
            ...getAfterSalesStatisticsSnapshotFields('defectType'),
          ],
          where: baseWhere,
          _count: { id: true },
        }),
        prisma.after_sales.groupBy({
          by: [
            'supplierBrandId',
            ...getAfterSalesStatisticsSnapshotFields('supplierBrand'),
          ],
          where: baseWhere,
          _count: { id: true },
        }),
        prisma.after_sales.groupBy({
          by: [
            'respDeptId',
            ...getAfterSalesStatisticsSnapshotFields('responsibleDept'),
          ],
          where: baseWhere,
          _count: { id: true },
        }),
      ]);

      const canonicalIdById = new Map<string, string>();
      const [defectNames, supplierNames, deptNames] = await Promise.all([
        QualityClassificationService.resolveCategoryNamesByIds(
          QUALITY_CLASSIFICATION_SCOPE.AFTER_SALES_DEFECT,
          defectStats.map((item) => item.defectCategoryId).filter(Boolean),
        ),
        MasterDataGovernanceKernel.resolveCanonicalNamesByIds({
          canonicalIds: supplierStats.map((item) => item.supplierBrandId),
          configKey: 'supplierBrand',
        }),
        DeptService.resolveActiveNamesByIds(
          deptStats.map((item) => item.respDeptId),
        ),
      ]);

      const trendResults = isYearMode
        ? await prisma.$queryRaw<TrendResultYear[]>`
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
        : await prisma.$queryRaw<TrendResultDay[]>`
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

      return formatStatsResponse({
        canonicalIdById,
        defectNames,
        defectStats,
        deptNames,
        deptStats,
        kpi: buildKpiSummary({ kpiAggregate, openCount, resolvedStats }),
        supplierNames,
        supplierStats,
        trend: buildTrendData({
          isYearMode,
          months,
          startDate,
          trendResults,
        }),
      });
    } catch (error) {
      logger.error({ err: error, params }, 'getStats failed');
      const emptyMonthly = () => Array.from({ length: months.length }, () => 0);
      return {
        kpi: { total: 0, open: 0, cost: 0, avgTime: 0 },
        trend: {
          category: months,
          issues: emptyMonthly(),
          closed: emptyMonthly(),
          costs: emptyMonthly(),
        },
        defectDistribution: [],
        supplierRanking: [],
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
    return AfterSalesChartAggregationService.getChartAggregation(params);
  },
};
