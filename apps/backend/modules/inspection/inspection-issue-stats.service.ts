import type {
  IdentityAggregateItem,
  IdentityResolutionStatus,
} from '@qgs/shared';

import type { InspectionIssueDateMode } from './inspection-issue';
import type { InspectionIssueUserContext } from './inspection-issue-access.service';
import type { InspectionIssueStatisticsIdentity } from './inspection-issue-statistics-identity';

import { Prisma } from '@prisma/client';
import {
  createIdentityAggregateItem,
  createResolvedAggregateItem,
  formatDate,
  QUALITY_CLASSIFICATION_SCOPE,
} from '@qgs/shared';
import { QualityClassificationService } from '~/modules/quality-classification';
import { MasterDataGovernanceKernel } from '~/utils/canonical-master-data';
import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';

import { buildInspectionIssueDateRange } from './inspection-issue';
import { applyInspectionIssueReadOwnership } from './inspection-issue-access.service';
import {
  getInspectionIssueStatisticsIdentityKey,
  resolveInspectionIssueStatisticsIdentity,
} from './inspection-issue-statistics-identity';

const logger = createModuleLogger('InspectionService');

type PieDataItem = IdentityAggregateItem;

interface ParetoDataItem {
  cumulativePercent: number;
  id: null | string;
  label: string;
  percent: number;
  resolutionStatus: IdentityResolutionStatus;
  value: number;
}

interface TrendDataItem {
  period: string;
  value: number;
}

interface IssueStats {
  totalCount: number;
  openCount: number;
  closedCount: number;
  totalLoss: number;
  closedRate: number;
  pareto: ParetoDataItem[];
  pieData: PieDataItem[];
  trendData: TrendDataItem[];
}

type InspectionIssueChartAggregateItem = IdentityAggregateItem;

type InspectionIssueChartDimension =
  | 'claim'
  | 'defectSubtype'
  | 'defectType'
  | 'division'
  | 'projectName'
  | 'reportMonth'
  | 'responsibleDepartment'
  | 'severity'
  | 'status'
  | 'supplierName';

type InspectionIssueChartMetric = 'count' | 'lossAmount' | 'quantity';

const CONTROLLED_DIMENSION_CONFIG_KEYS: Partial<
  Record<InspectionIssueChartDimension, string>
> = {
  division: 'division',
  projectName: 'projectName',
  responsibleDepartment: 'responsibleDepartment',
  supplierName: 'supplierName',
};

export const InspectionIssueStatsService = {
  async getIssueStats(params: {
    dateMode?: InspectionIssueDateMode;
    dateValue?: string;
    userContext?: InspectionIssueUserContext;
    year?: number;
  }): Promise<IssueStats> {
    const currentYear = params.year || new Date().getFullYear();
    const { start, end } = buildInspectionIssueDateRange({
      dateMode: params.dateMode,
      dateValue: params.dateValue,
      year: params.year,
    });
    let where: Prisma.quality_recordsWhereInput = {
      isDeleted: false,
      date: { gte: start, lt: end },
    };
    if (params.userContext?.userId) {
      where = applyInspectionIssueReadOwnership(where, params.userContext);
    }

    try {
      // 1. Core aggregations (Total, Loss, Status counts)
      const [stats, closedCount] = await Promise.all([
        prisma.quality_records.aggregate({
          where,
          _count: { id: true },
          _sum: { lossAmount: true },
        }),
        prisma.quality_records.count({
          where: { ...where, status: 'CLOSED' },
        }),
      ]);

      const totalCount = stats._count.id || 0;
      const totalLoss = Number(stats._sum.lossAmount) || 0;
      const closedRate =
        totalCount > 0 ? Math.round((closedCount / totalCount) * 100) : 0;

      // 2. Defect Type Distribution
      const typeStats = await prisma.quality_records.groupBy({
        by: ['defectCategoryId'],
        where,
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
      });
      const defectTypeNames =
        await QualityClassificationService.resolveCategoryNamesByIds(
          QUALITY_CLASSIFICATION_SCOPE.INSPECTION_ISSUE_DEFECT,
          typeStats.map((item) => item.defectCategoryId),
        );

      const pieData: PieDataItem[] = typeStats.map((s) =>
        createIdentityAggregateItem({
          canonicalName: s.defectCategoryId
            ? defectTypeNames.get(s.defectCategoryId)
            : null,
          id: s.defectCategoryId,
          value: s._count.id,
        }),
      );
      let cumulativeCount = 0;
      const pareto: ParetoDataItem[] = pieData.map((item) => {
        cumulativeCount += item.value;
        return {
          id: item.id,
          label: item.name,
          resolutionStatus: item.resolutionStatus,
          value: item.value,
          percent:
            totalCount > 0 ? Math.round((item.value / totalCount) * 100) : 0,
          cumulativePercent:
            totalCount > 0
              ? Math.round((cumulativeCount / totalCount) * 100)
              : 0,
        };
      });

      const trendData = await InspectionIssueStatsService.buildIssueTrendData({
        currentYear,
        dateMode: params.dateMode,
        end,
        start,
        where,
      });

      return {
        totalCount,
        openCount: totalCount - closedCount,
        closedCount,
        totalLoss,
        closedRate,
        pareto,
        pieData,
        trendData,
      };
    } catch (error) {
      logger.error({ err: error, params }, 'getIssueStats failed');
      throw error;
    }
  },
  async getIssueChartAggregation(params: {
    dateMode?: InspectionIssueDateMode;
    dateValue?: string;
    dimension: InspectionIssueChartDimension;
    metric: InspectionIssueChartMetric;
    top?: number;
    userContext?: InspectionIssueUserContext;
    year?: number;
  }): Promise<InspectionIssueChartAggregateItem[]> {
    const { start, end } = buildInspectionIssueDateRange({
      dateMode: params.dateMode,
      dateValue: params.dateValue,
      year: params.year,
    });

    let where: Prisma.quality_recordsWhereInput = {
      isDeleted: false,
      date: { gte: start, lt: end },
    };
    if (params.userContext?.userId) {
      where = applyInspectionIssueReadOwnership(where, params.userContext);
    }

    const rows = await prisma.quality_records.findMany({
      where,
      select: {
        date: true,
        defectCategoryId: true,
        defectSubcategoryId: true,
        defectSubtype: true,
        defectType: true,
        division: true,
        divisionId: true, // governance-allow-direct-name-id
        isClaim: true,
        lossAmount: true,
        projectId: true, // governance-allow-direct-name-id
        projectName: true,
        quantity: true,
        responsibleDepartment: true,
        responsibleDepartmentId: true, // governance-allow-direct-name-id
        severity: true,
        status: true,
        supplierId: true, // governance-allow-direct-name-id
        supplierName: true,
      },
    });

    const controlledConfigKey =
      CONTROLLED_DIMENSION_CONFIG_KEYS[params.dimension];
    const classificationDimension =
      params.dimension === 'defectType' || params.dimension === 'defectSubtype';
    const aggregateMap = new Map<
      string,
      {
        identity: InspectionIssueStatisticsIdentity | null;
        name: string;
        value: number;
      }
    >();
    for (const row of rows) {
      let canonicalId: null | string = null;
      let name = '未分类';
      const identity = resolveInspectionIssueStatisticsIdentity(
        params.dimension,
        row,
      );
      switch (params.dimension) {
        case 'claim': {
          name = row.isClaim ? 'Yes' : 'No';
          break;
        }
        case 'defectSubtype': {
          canonicalId = row.defectSubcategoryId;
          break;
        }
        case 'defectType': {
          canonicalId = row.defectCategoryId;
          break;
        }
        case 'division': {
          canonicalId = row.divisionId;
          break;
        }
        case 'projectName': {
          canonicalId = row.projectId;
          break;
        }
        case 'reportMonth': {
          name = formatDate(row.date).slice(0, 7);
          break;
        }
        case 'responsibleDepartment': {
          canonicalId = row.responsibleDepartmentId;
          break;
        }
        case 'severity': {
          name = row.severity || '未分类';
          break;
        }
        case 'status': {
          name = row.status || '未分类';
          break;
        }
        case 'supplierName': {
          canonicalId = row.supplierId;
          break;
        }
      }

      let value = 1;
      if (params.metric === 'lossAmount') {
        value = Number(row.lossAmount || 0);
      } else if (params.metric === 'quantity') {
        value = Number(row.quantity || 0);
      }
      const normalizedId = String(canonicalId || '').trim() || null;
      let key = `value:${name}`;
      if (controlledConfigKey || classificationDimension) {
        if (identity) {
          key = getInspectionIssueStatisticsIdentityKey(identity);
        } else {
          key = normalizedId
            ? `id:${normalizedId}`
            : 'missing:MISSING_REQUIRED:';
        }
      }
      const current = aggregateMap.get(key);
      aggregateMap.set(key, {
        identity,
        name,
        value: (current?.value || 0) + value,
      });
    }

    const aggregateRows = [...aggregateMap.values()];
    const canonicalIds = aggregateRows.map((item) => item.identity?.id || null);
    let canonicalNames = new Map<string, null | string>();
    if (params.dimension === 'defectType') {
      canonicalNames =
        await QualityClassificationService.resolveCategoryNamesByIds(
          QUALITY_CLASSIFICATION_SCOPE.INSPECTION_ISSUE_DEFECT,
          canonicalIds,
        );
    } else if (params.dimension === 'defectSubtype') {
      canonicalNames =
        await QualityClassificationService.resolveSubcategoryNamesByIds(
          QUALITY_CLASSIFICATION_SCOPE.INSPECTION_ISSUE_DEFECT,
          canonicalIds,
        );
    } else if (controlledConfigKey) {
      canonicalNames =
        await MasterDataGovernanceKernel.resolveCanonicalNamesByIds({
          configKey: controlledConfigKey,
          canonicalIds,
        });
    }
    const top = Number(params.top) > 0 ? Number(params.top) : 15;
    return aggregateRows
      .map((item) => {
        const value = Math.round(item.value * 100) / 100;
        return controlledConfigKey || classificationDimension
          ? createIdentityAggregateItem({
              canonicalName: item.identity?.id
                ? canonicalNames.get(item.identity.id)
                : null,
              id: item.identity?.id,
              missingName: item.identity?.missingName,
              rawName: item.identity?.rawName,
              resolutionReason: item.identity?.resolutionReason,
              value,
            })
          : createResolvedAggregateItem({
              id: item.name,
              value,
            });
      })
      .sort((a, b) => b.value - a.value)
      .slice(0, top);
  },
  async buildIssueTrendData(params: {
    currentYear: number;
    dateMode?: InspectionIssueDateMode;
    end: Date;
    start: Date;
    where: Prisma.quality_recordsWhereInput;
  }): Promise<TrendDataItem[]> {
    const ownershipFilter =
      typeof params.where.createdBy === 'string'
        ? Prisma.sql`AND createdBy = ${params.where.createdBy}`
        : Prisma.sql``;

    if (params.dateMode === 'month' || params.dateMode === 'week') {
      const trendResults = await prisma.$queryRaw<
        Array<{ amount: number; day: Date | string }>
      >(Prisma.sql`
        SELECT DATE(date) AS day, SUM(IFNULL(lossAmount, 0)) AS amount
        FROM quality_records
        WHERE isDeleted = 0
          AND date >= ${params.start}
          AND date < ${params.end}
          ${ownershipFilter}
        GROUP BY DATE(date)
        ORDER BY day ASC
      `);
      const dayMap = new Map<string, number>();
      const cursor = new Date(params.start);

      while (cursor < params.end) {
        const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
        dayMap.set(key, 0);
        cursor.setDate(cursor.getDate() + 1);
      }

      trendResults.forEach((item) => {
        const key =
          item.day instanceof Date
            ? formatDate(item.day)
            : String(item.day).slice(0, 10);
        if (dayMap.has(key)) {
          dayMap.set(key, Number(Number(item.amount || 0).toFixed(2)));
        }
      });

      return [...dayMap.entries()].map(([period, value]) => ({
        period,
        value,
      }));
    }

    const trendResults = await prisma.$queryRaw<
      Array<{ amount: number; month: number }>
    >(Prisma.sql`
      SELECT MONTH(date) AS month, SUM(IFNULL(lossAmount, 0)) AS amount
      FROM quality_records
      WHERE isDeleted = 0
        AND date >= ${params.start}
        AND date < ${params.end}
        ${ownershipFilter}
      GROUP BY MONTH(date)
      ORDER BY month ASC
    `);

    const trendMap = new Map<string, number>();
    for (let i = 1; i <= 12; i++) {
      const monthKey = `${params.currentYear}-${String(i).padStart(2, '0')}`;
      trendMap.set(monthKey, 0);
    }

    trendResults.forEach((item) => {
      const monthKey = `${params.currentYear}-${String(item.month).padStart(2, '0')}`;
      if (!trendMap.has(monthKey)) return;
      trendMap.set(monthKey, Number(Number(item.amount || 0).toFixed(2)));
    });

    return [...trendMap.entries()].map(([period, value]) => ({
      period,
      value,
    }));
  },
};
