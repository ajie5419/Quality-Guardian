import type {
  QualityLossCharts,
  QualityLossDashboardSummary,
  QualityLossItem,
} from '@qgs/shared';

import type { QualityLossQueryParams } from './quality-loss-format';

import { normalizeQualityLossStatus } from '~/modules/quality-loss/quality-loss-status';

import { getWeekOfYear } from './quality-loss-format';

export const QualityLossSummaryService = {
  getDashboardSummary(list: QualityLossItem[]): QualityLossDashboardSummary {
    const totalAmount = list.reduce(
      (sum, item) => sum + (Number(item.amount) || 0),
      0,
    );
    const totalClaim = list.reduce(
      (sum, item) => sum + (Number(item.actualClaim) || 0),
      0,
    );
    const recoveryRate =
      totalAmount > 0 ? Math.round((totalClaim / totalAmount) * 1000) / 10 : 0;
    let pendingAmount = 0;
    for (const item of list) {
      const status = normalizeQualityLossStatus(item.status);
      if (
        status === 'Pending' ||
        status === 'Processing' ||
        status === 'Resolved'
      ) {
        pendingAmount +=
          (Number(item.amount) || 0) - (Number(item.actualClaim) || 0);
      }
    }

    const years = [
      ...new Set(
        list
          .map((item) => {
            const time = new Date(item.date || '').getTime();
            if (Number.isNaN(time)) return null;
            return new Date(time).getFullYear();
          })
          .filter((year): year is number => year !== null),
      ),
    ].sort((a, b) => b - a);

    return {
      kpi: {
        totalAmount: Number(totalAmount.toFixed(2)),
        totalClaim: Number(totalClaim.toFixed(2)),
        recoveryRate,
        displayRate: `${recoveryRate}%`,
        pendingAmount: Number(pendingAmount.toFixed(2)),
      },
      years: years.length > 0 ? years : [new Date().getFullYear()],
    };
  },

  getYearlyCharts(
    list: QualityLossItem[],
    filters: Omit<QualityLossQueryParams, 'page' | 'pageSize'> = {},
  ): QualityLossCharts {
    const targetYear = Number(filters.year) || new Date().getFullYear();
    const granularity = filters.granularity || 'month';
    const filteredByYear = list.filter((item) => {
      const time = new Date(item.date || '').getTime();
      if (Number.isNaN(time)) return false;
      return new Date(time).getFullYear() === targetYear;
    });

    const deptMap = new Map<
      null | string,
      {
        name: string;
        resolutionStatus: 'INVALID' | 'MISSING' | 'RESOLVED';
        value: number;
      }
    >();
    for (const item of filteredByYear) {
      const id = String(item.responsibleDepartmentId || '').trim() || null;
      const amount = Number(item.amount) || 0;
      const current = deptMap.get(id) || {
        name: String(item.responsibleDepartment || ''),
        resolutionStatus:
          item.responsibleDepartmentResolutionStatus ||
          (id ? 'INVALID' : 'MISSING'),
        value: 0,
      };
      current.value += amount;
      deptMap.set(id, current);
    }
    const deptDistribution = [...deptMap.entries()]
      .map(([id, item]) => ({
        id,
        name: item.name,
        resolutionStatus: item.resolutionStatus,
        value: Number(item.value.toFixed(2)),
      }))
      .sort((a, b) => b.value - a.value);

    const trendMap = new Map<
      number,
      { claimAmount: number; totalAmount: number }
    >();
    const upsertTrend = (key: number, amount: number, claimAmount: number) => {
      const current = trendMap.get(key) || { totalAmount: 0, claimAmount: 0 };
      current.totalAmount += amount;
      current.claimAmount += claimAmount;
      trendMap.set(key, current);
    };

    for (const item of list) {
      const date = new Date(item.date || '');
      if (Number.isNaN(date.getTime())) continue;
      const amount = Number(item.amount) || 0;
      const claimAmount = Number(item.actualClaim) || 0;
      if (granularity === 'year') {
        upsertTrend(date.getFullYear(), amount, claimAmount);
        continue;
      }
      if (date.getFullYear() !== targetYear) continue;
      if (granularity === 'week') {
        upsertTrend(getWeekOfYear(date), amount, claimAmount);
      } else {
        upsertTrend(date.getMonth() + 1, amount, claimAmount);
      }
    }

    let trend: QualityLossCharts['trend'] = [];
    if (granularity === 'year') {
      trend = [...trendMap.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([period, value]) => ({
          period,
          periodLabel: `${period}年`,
          totalAmount: Number(value.totalAmount.toFixed(2)),
          claimAmount: Number(value.claimAmount.toFixed(2)),
        }));
    } else if (granularity === 'week') {
      trend = Array.from({ length: 53 }).map((_, index) => {
        const period = index + 1;
        const value = trendMap.get(period) || {
          totalAmount: 0,
          claimAmount: 0,
        };
        return {
          period,
          periodLabel: `W${period}`,
          totalAmount: Number(value.totalAmount.toFixed(2)),
          claimAmount: Number(value.claimAmount.toFixed(2)),
        };
      });
    } else {
      trend = Array.from({ length: 12 }).map((_, index) => {
        const period = index + 1;
        const value = trendMap.get(period) || {
          totalAmount: 0,
          claimAmount: 0,
        };
        return {
          period,
          periodLabel: `${period}月`,
          totalAmount: Number(value.totalAmount.toFixed(2)),
          claimAmount: Number(value.claimAmount.toFixed(2)),
        };
      });
    }

    return {
      deptDistribution,
      trend,
    };
  },
};
