import type { ResolvedDataScope } from '~/modules/data-scope/data-scope.service';

import type { InspectionIssueDateMode } from './inspection-issue';

import { Prisma } from '@prisma/client';
import { formatDate } from '@qgs/shared';
import { MasterDataGovernanceKernel } from '~/governance/master-data/master-data-governance-kernel';
import { DataScopeService } from '~/modules/data-scope/data-scope.service';
import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';

import { buildInspectionIssueDateRange } from './inspection-issue';

const logger = createModuleLogger('InspectionService');

interface PieDataItem {
  name: string;
  value: number;
}

interface ParetoDataItem {
  cumulativePercent: number;
  label: string;
  percent: number;
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

type InspectionIssueChartAggregateItem = {
  name: string;
  value: number;
};

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

export const InspectionIssueStatsService = {
  async getIssueStats(params: {
    dateMode?: InspectionIssueDateMode;
    dateValue?: string;
    year?: number;
  }): Promise<IssueStats> {
    const currentYear = params.year || new Date().getFullYear();
    const { start, end } = buildInspectionIssueDateRange({
      dateMode: params.dateMode,
      dateValue: params.dateValue,
      year: params.year,
    });
    const where: Prisma.quality_recordsWhereInput = {
      isDeleted: false,
      date: { gte: start, lt: end },
    };

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
        by: ['defectType'],
        where,
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
      });

      const pieData: PieDataItem[] = typeStats.map((s) => ({
        name: s.defectType || 'Unknown',
        value: s._count.id,
      }));
      let cumulativeCount = 0;
      const pareto: ParetoDataItem[] = pieData.map((item) => {
        cumulativeCount += item.value;
        return {
          label: item.name,
          value: item.value,
          percent:
            totalCount > 0 ? Math.round((item.value / totalCount) * 100) : 0,
          cumulativePercent:
            totalCount > 0
              ? Math.round((cumulativeCount / totalCount) * 100)
              : 0,
        };
      });

      // 3. Monthly Trend (Using Raw Query for efficiency)
      const trendData = await InspectionIssueStatsService.buildIssueTrendData({
        currentYear,
        dateMode: params.dateMode,
        end,
        start,
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
    dataScope?: ResolvedDataScope;
    dateMode?: InspectionIssueDateMode;
    dateValue?: string;
    dimension: InspectionIssueChartDimension;
    metric: InspectionIssueChartMetric;
    top?: number;
    userContext?: { userId: string; username?: string };
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
      where = await DataScopeService.buildInspectionWhere(
        where,
        {
          userId: params.userContext.userId,
          username: params.userContext.username,
        },
        params.dataScope,
      );
    }

    const rows = await prisma.quality_records.findMany({
      where,
      select: {
        date: true,
        defectSubtypeId: true, // governance-allow-direct-name-id
        defectTypeId: true, // governance-allow-direct-name-id
        defectSubtype: true,
        defectType: true,
        division: true,
        isClaim: true,
        lossAmount: true,
        projectName: true,
        quantity: true,
        responsibleDepartment: true,
        severity: true,
        status: true,
        supplierName: true,
      },
    });

    const [defectTypeNameById, defectSubtypeNameById] = await Promise.all([
      MasterDataGovernanceKernel.resolveCanonicalNamesByIds({
        configKey: 'defectType',
        canonicalIds: rows.map((item) => item.defectTypeId),
      }),
      MasterDataGovernanceKernel.resolveCanonicalNamesByIds({
        configKey: 'defectSubtype',
        canonicalIds: rows.map((item) => item.defectSubtypeId),
      }),
    ]);

    const aggregateMap = new Map<string, number>();
    for (const row of rows) {
      let key = '未分类';
      switch (params.dimension) {
        case 'claim': {
          key = row.isClaim ? 'Yes' : 'No';
          break;
        }
        case 'defectSubtype': {
          key =
            defectSubtypeNameById.get(String(row.defectSubtypeId || '')) ||
            row.defectSubtype ||
            '未分类';
          break;
        }
        case 'defectType': {
          key =
            defectTypeNameById.get(String(row.defectTypeId || '')) ||
            row.defectType ||
            '未分类';
          break;
        }
        case 'division': {
          key = row.division || '未分类';
          break;
        }
        case 'projectName': {
          key = row.projectName || '未分类';
          break;
        }
        case 'reportMonth': {
          key = formatDate(row.date).slice(0, 7);
          break;
        }
        case 'responsibleDepartment': {
          key = row.responsibleDepartment || '未分类';
          break;
        }
        case 'severity': {
          key = row.severity || '未分类';
          break;
        }
        case 'status': {
          key = row.status || '未分类';
          break;
        }
        case 'supplierName': {
          key = row.supplierName || '未分类';
          break;
        }
      }

      let value = 1;
      if (params.metric === 'lossAmount') {
        value = Number(row.lossAmount || 0);
      } else if (params.metric === 'quantity') {
        value = Number(row.quantity || 0);
      }
      aggregateMap.set(key, (aggregateMap.get(key) || 0) + value);
    }

    const top = Number(params.top) > 0 ? Number(params.top) : 15;
    return [...aggregateMap.entries()]
      .map(([name, value]) => ({
        name,
        value: Math.round(value * 100) / 100,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, top);
  },
  async buildIssueTrendData(params: {
    currentYear: number;
    dateMode?: InspectionIssueDateMode;
    end: Date;
    start: Date;
  }): Promise<TrendDataItem[]> {
    if (params.dateMode === 'month' || params.dateMode === 'week') {
      const dayMap = new Map<string, number>();
      const cursor = new Date(params.start);

      while (cursor < params.end) {
        const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
        dayMap.set(key, 0);
        cursor.setDate(cursor.getDate() + 1);
      }

      const trendResults = await prisma.$queryRaw<
        Array<{ amount: number; day: string }>
      >`
        SELECT 
          DATE(date) as day,
          SUM(IFNULL(lossAmount, 0)) as amount
        FROM quality_records
        WHERE isDeleted = 0 AND date >= ${params.start} AND date < ${params.end}
        GROUP BY DATE(date)
      `;

      trendResults.forEach((item) => {
        const key = String(item.day);
        if (dayMap.has(key)) {
          dayMap.set(key, Number(Number(item.amount).toFixed(2)));
        }
      });

      return [...dayMap.entries()].map(([period, value]) => ({
        period,
        value,
      }));
    }

    const trendResults = await prisma.$queryRaw<
      Array<{ amount: number; month: number }>
    >`
      SELECT 
        MONTH(date) as month,
        SUM(IFNULL(lossAmount, 0)) as amount
      FROM quality_records
      WHERE isDeleted = 0 AND date >= ${params.start} AND date < ${params.end}
      GROUP BY month
    `;

    const trendMap = new Map<string, number>();
    for (let i = 1; i <= 12; i++) {
      const monthKey = `${params.currentYear}-${String(i).padStart(2, '0')}`;
      trendMap.set(monthKey, 0);
    }

    trendResults.forEach((r) => {
      const monthKey = `${params.currentYear}-${String(r.month).padStart(2, '0')}`;
      if (trendMap.has(monthKey)) {
        trendMap.set(monthKey, Number(Number(r.amount).toFixed(2)));
      }
    });

    return [...trendMap.entries()].map(([period, value]) => ({
      period,
      value,
    }));
  },
};
