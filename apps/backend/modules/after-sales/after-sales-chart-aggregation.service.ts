import type { ResolvedDataScope } from '~/modules/data-scope/data-scope.service';

import type {
  AfterSalesChartAggregateItem,
  AfterSalesChartDimension,
  AfterSalesChartMetric,
} from './after-sales-analytics.service';
import type { AfterSalesDateMode } from './after-sales-query';
import type { AfterSalesStatisticsIdentity } from './after-sales-statistics-identity';

import { Prisma } from '@prisma/client';
import {
  createIdentityAggregateItem,
  createResolvedAggregateItem,
  formatDate,
  QMS_DEFAULT_VALUES,
  QUALITY_CLASSIFICATION_SCOPE,
} from '@qgs/shared';
import { DataScopeService } from '~/modules/data-scope/data-scope.service';
import { QualityClassificationService } from '~/modules/quality-classification';
import { MasterDataGovernanceKernel } from '~/utils/canonical-master-data';
import prisma from '~/utils/prisma';

import { buildAfterSalesDateRange } from './after-sales-query';
import {
  getAfterSalesStatisticsIdentityKey,
  getAfterSalesStatisticsSnapshotFields,
  resolveAfterSalesStatisticsIdentity,
} from './after-sales-statistics-identity';

const CHART_DIMENSION_CONFIG: Record<
  Exclude<AfterSalesChartDimension, 'reportMonth'>,
  {
    classification?: {
      level: 'category' | 'subcategory';
      scope:
        | typeof QUALITY_CLASSIFICATION_SCOPE.AFTER_SALES_DEFECT
        | typeof QUALITY_CLASSIFICATION_SCOPE.AFTER_SALES_PRODUCT;
    };
    field:
      | 'claimStatus'
      | 'defectCategoryId'
      | 'defectSubcategoryId'
      | 'productCategoryId'
      | 'productSubcategoryId'
      | 'respDeptId'
      | 'severity'
      | 'supplierBrandId';
    governanceKey?: string;
  }
> = {
  defectSubtype: {
    field: 'defectSubcategoryId',
    classification: {
      level: 'subcategory',
      scope: QUALITY_CLASSIFICATION_SCOPE.AFTER_SALES_DEFECT,
    },
  },
  defectType: {
    field: 'defectCategoryId',
    classification: {
      level: 'category',
      scope: QUALITY_CLASSIFICATION_SCOPE.AFTER_SALES_DEFECT,
    },
  },
  productSubtype: {
    field: 'productSubcategoryId',
    classification: {
      level: 'subcategory',
      scope: QUALITY_CLASSIFICATION_SCOPE.AFTER_SALES_PRODUCT,
    },
  },
  productType: {
    field: 'productCategoryId',
    classification: {
      level: 'category',
      scope: QUALITY_CLASSIFICATION_SCOPE.AFTER_SALES_PRODUCT,
    },
  },
  responsibleDept: {
    field: 'respDeptId',
    governanceKey: 'responsibleDepartment',
  },
  severity: { field: 'severity' },
  status: { field: 'claimStatus' },
  supplierBrand: {
    field: 'supplierBrandId',
    governanceKey: 'supplierBrand',
  },
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
    case 'totalLoss': {
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
    case 'totalLoss': {
      return Number(sum?.materialCost || 0) + Number(sum?.laborTravelCost || 0);
    }
  }
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

    const dimensionConfig = CHART_DIMENSION_CONFIG[dimension];
    const byField = dimensionConfig.field;
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

    const snapshotFields = getAfterSalesStatisticsSnapshotFields(dimension);
    const grouped = await prisma.after_sales.groupBy({
      by: [byField, ...snapshotFields],
      where,
      ...(conf.count ? { _count: { id: true } } : {}),
      ...(conf.sumFields.length > 0 ? { _sum: sumPayload } : {}),
    });
    const aggregateMap = new Map<
      string,
      {
        identity: AfterSalesStatisticsIdentity | null;
        rawId: null | string;
        value: number;
      }
    >();
    for (const item of grouped) {
      const source = item as Record<string, unknown>;
      const identity = resolveAfterSalesStatisticsIdentity(dimension, source);
      const rawId = source[byField] ? String(source[byField]) : null;
      const key = identity
        ? getAfterSalesStatisticsIdentityKey(identity)
        : rawId || '';
      const current = aggregateMap.get(key);
      aggregateMap.set(key, {
        identity,
        rawId,
        value:
          (current?.value || 0) + getMetricValueFromGroupedItem(metric, source),
      });
    }
    const aggregateRows = [...aggregateMap.values()];

    const canonicalIdById = new Map<string, string>();
    let canonicalNames = dimensionConfig.governanceKey
      ? await MasterDataGovernanceKernel.resolveCanonicalNamesByIds({
          canonicalIds: aggregateRows.map(
            (item) => item.identity?.id || item.rawId,
          ),
          configKey: dimensionConfig.governanceKey,
          canonicalIdById,
          idLikeNameById: aggregateRows
            .map((item) => ({
              id: item.identity?.id || item.rawId || '',
              rawName: item.identity?.rawName ?? null,
            }))
            .filter((pair) => pair.id !== ''),
        })
      : new Map<string, null | string>();
    if (dimensionConfig.classification) {
      const ids = aggregateRows
        .map((item) => item.identity?.id || item.rawId)
        .filter(Boolean);
      canonicalNames =
        dimensionConfig.classification.level === 'category'
          ? await QualityClassificationService.resolveCategoryNamesByIds(
              dimensionConfig.classification.scope,
              ids,
            )
          : await QualityClassificationService.resolveSubcategoryNamesByIds(
              dimensionConfig.classification.scope,
              ids,
            );
    }

    return MasterDataGovernanceKernel.mergeResolvedIdentityAggregateItems(
      aggregateRows.map((item) => {
        const rawId = item.identity?.id || item.rawId;
        const roundedValue = Number(item.value.toFixed(2));
        return dimensionConfig.governanceKey || dimensionConfig.classification
          ? createIdentityAggregateItem({
              canonicalName: rawId ? canonicalNames.get(rawId) : null,
              id: rawId,
              missingName: item.identity?.missingName,
              rawName: item.identity?.rawName,
              resolutionReason: item.identity?.resolutionReason,
              value: roundedValue,
            })
          : createResolvedAggregateItem({
              id: rawId || QMS_DEFAULT_VALUES.UNCLASSIFIED,
              value: roundedValue,
            });
      }),
      { canonicalIdById },
    )
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
        ...createResolvedAggregateItem({
          id: name,
          value: Number(value.toFixed(2)),
        }),
      }));
  },
};
