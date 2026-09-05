import type { Prisma } from '@prisma/client';
import type {
  IdentityAggregateItem,
  QualityLossCharts,
  QualityLossItem,
} from '@qgs/shared';

import { createIdentityAggregateItem } from '@qgs/shared';
import { MasterDataGovernanceKernel } from '~/utils/canonical-master-data';

import { getWeekOfYear } from './quality-loss-format';

export interface QualityLossDeptGroupRow {
  respDeptId: null | string;
  _max?: null | { respDept?: null | string };
  _sum: null | { amount: null | number | Prisma.Decimal };
}

export interface QualityLossDateGroupRow {
  occurDate: Date;
  _sum: null | {
    actualClaim: null | number | Prisma.Decimal;
    amount: null | number | Prisma.Decimal;
  };
}

/**
 * Builds the [Jan 1 00:00 +08:00, Jan 1 00:00 +08:00) instant range for a
 * year. The legacy Node implementation derived the year from the formatted
 * date string, so the filter must cover the Shanghai-local wall-clock year.
 * Prisma stores DateTime as UTC, so the +08:00 boundaries keep the window
 * index-friendly (range predicates on occurDate).
 */
export function buildShanghaiYearWindow(year: number) {
  return {
    gte: new Date(`${year}-01-01T00:00:00+08:00`),
    lt: new Date(`${year + 1}-01-01T00:00:00+08:00`),
  };
}

/**
 * Aggregates the yearly department distribution from DB groupBy rows keyed by
 * the canonical respDeptId (never the display snapshot), then hydrates the
 * canonical department name after aggregation. Unresolved ids keep a
 * representative raw snapshot name (via _max) for display fallback.
 */
export async function buildQualityLossDeptDistribution(
  deptGroups: QualityLossDeptGroupRow[],
): Promise<IdentityAggregateItem[]> {
  const deptNames = await MasterDataGovernanceKernel.resolveCanonicalNamesByIds(
    {
      canonicalIds: deptGroups.map((item) => item.respDeptId).filter(Boolean),
      configKey: 'responsibleDepartment',
      idLikeNameById: deptGroups
        .map((item) => ({
          id: item.respDeptId || '',
          rawName: item._max?.respDept ?? null,
        }))
        .filter((pair) => pair.id !== ''),
    },
  );
  const deptMap = new Map<
    string,
    {
      id: null | string;
      name: string;
      rawName: null | string;
      resolutionReason?: QualityLossItem['responsibleDepartmentResolutionReason'];
      resolutionStatus: 'INVALID' | 'MISSING' | 'RESOLVED';
      value: number;
    }
  >();
  for (const group of deptGroups) {
    const id = String(group.respDeptId || '').trim() || null;
    const rawName = String(group._max?.respDept || '').trim() || null;
    const identity = createIdentityAggregateItem({
      canonicalName: id ? deptNames.get(id) : null,
      id,
      rawName,
      value: 0,
    });
    const resolutionReason =
      identity.resolutionReason ||
      (id ? 'INVALID_REFERENCE' : 'MISSING_REQUIRED');
    const key = id
      ? `id:${id}`
      : `missing:${resolutionReason}:${rawName || ''}`;
    const current = deptMap.get(key) || {
      id,
      name: identity.name || rawName || '',
      rawName,
      resolutionReason,
      resolutionStatus: identity.resolutionStatus,
      value: 0,
    };
    current.value += Number(group._sum?.amount) || 0;
    deptMap.set(key, current);
  }
  return [...deptMap.values()]
    .map((item) => ({
      id: item.id,
      name: item.name,
      ...(item.rawName && item.resolutionStatus !== 'RESOLVED'
        ? { rawName: item.rawName }
        : {}),
      ...(item.resolutionStatus === 'RESOLVED'
        ? {}
        : { resolutionReason: item.resolutionReason }),
      resolutionStatus: item.resolutionStatus,
      value: Number(item.value.toFixed(2)),
    }))
    .sort((a, b) => b.value - a.value);
}

/**
 * Buckets DB date groups into the requested granularity (year/week/month).
 * Only the month/week buckets are constrained to the target year; the
 * year-granularity trend spans every year present in the scoped set.
 */
export function buildQualityLossYearlyTrend(
  dateGroups: QualityLossDateGroupRow[],
  params: { granularity: string; targetYear: number },
): QualityLossCharts['trend'] {
  const { granularity, targetYear } = params;
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
  for (const group of dateGroups) {
    const date = group.occurDate;
    const amount = Number(group._sum?.amount) || 0;
    const claimAmount = Number(group._sum?.actualClaim) || 0;
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
  return trend;
}
