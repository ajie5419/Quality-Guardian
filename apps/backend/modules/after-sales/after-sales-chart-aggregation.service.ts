import type { ResolvedDataScope } from '~/modules/data-scope/data-scope.service';

import type {
  AfterSalesChartAggregateItem,
  AfterSalesChartDimension,
  AfterSalesChartMetric,
} from './after-sales-analytics.service';
import type { AfterSalesDateMode } from './after-sales-query';

import { Prisma } from '@prisma/client';
import { formatDate, QMS_DEFAULT_VALUES } from '@qgs/shared';
import { DataScopeService } from '~/modules/data-scope/data-scope.service';
import { flattenDeptTree } from '~/modules/dept/dept-tree';
import { DeptService } from '~/modules/dept/dept.service';
import prisma from '~/utils/prisma';

import { buildAfterSalesDateRange } from './after-sales-query';

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
  item: Record<string, unknown>,
) {
  const count = item._count as undefined | { id?: number };
  const sum = item._sum as
    | undefined
    | {
        laborTravelCost?: null | number | Prisma.Decimal;
        materialCost?: null | number | Prisma.Decimal;
        quantity?: null | number | Prisma.Decimal;
        runningHours?: null | number | Prisma.Decimal;
      };
  switch (metric) {
    case 'count': {
      return Number(count?.id || 0);
    }
    case 'laborTravelCost': {
      return Number(sum?.laborTravelCost || 0);
    }
    case 'materialCost': {
      return Number(sum?.materialCost || 0);
    }
    case 'quantity': {
      return Number(sum?.quantity || 0);
    }
    case 'runningHours': {
      return Number(sum?.runningHours || 0);
    }
    default: {
      return Number(sum?.materialCost || 0) + Number(sum?.laborTravelCost || 0);
    }
  }
}

async function buildDeptNameMap() {
  const deptTree = await DeptService.findAll().catch(() => []);
  const deptMap = new Map<string, string>();
  for (const node of flattenDeptTree(deptTree)) deptMap.set(node.id, node.name);
  return deptMap;
}

export const AfterSalesChartAggregationService = {
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
      return this.getReportMonthAggregation(where, metric, limit);
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
    for (const field of conf.sumFields) sumPayload[field] = true;

    const grouped = await prisma.after_sales.groupBy({
      by: [byField],
      where,
      ...(conf.count ? { _count: { id: true } } : {}),
      ...(conf.sumFields.length > 0 ? { _sum: sumPayload } : {}),
    });
    const deptNameMap =
      dimension === 'responsibleDept' ? await buildDeptNameMap() : null;

    return grouped
      .map((item) => {
        const source = item as Record<string, unknown>;
        const rawName = String(
          source[byField] || QMS_DEFAULT_VALUES.UNCLASSIFIED,
        );
        const value = getMetricValueFromGroupedItem(metric, source);
        return {
          name: deptNameMap?.get(rawName) || rawName,
          value: Number(value.toFixed(2)),
        };
      })
      .sort((a, b) => b.value - a.value)
      .slice(0, limit);
  },

  async getReportMonthAggregation(
    where: Prisma.after_salesWhereInput,
    metric: AfterSalesChartMetric,
    limit: number,
  ) {
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
      map.set(key, (map.get(key) || 0) + getMetricValueFromRow(metric, row));
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(0, limit)
      .map(([name, value]) => ({
        name,
        value: Number(value.toFixed(2)),
      }));
  },
};
