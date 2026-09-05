import type { AnalyticsAccessContext } from '~/modules/data-scope';

import {
  getLegacyInspectionPassRateSummaryByRange,
  getPassRateMonthlyTrend,
} from '~/modules/report';
import { SystemLogService } from '~/modules/system-log';

import { executeFirstPassDualRun } from './metric-dual-run';

export interface FirstPassYieldConsumerResult {
  metricCode: 'BM-FIRST-PASS-YIELD';
  source: 'CANONICAL_ADAPTER' | 'LEGACY_ROLLBACK';
  value: null | number;
}

export type FirstPassYieldReportResult = FirstPassYieldConsumerResult & {
  totalCount: number;
};

/**
 * Report consumer boundary. The report remains legacy by default; callers
 * must explicitly opt into the canonical adapter and can roll back by
 * setting useCanonical to false without changing report history.
 */
export async function getFirstPassYieldForReport(input: {
  access?: AnalyticsAccessContext;
  end: Date;
  start: Date;
  useCanonical: boolean;
}): Promise<FirstPassYieldReportResult> {
  if (!input.useCanonical) {
    const legacy = await getLegacyInspectionPassRateSummaryByRange(
      input.start,
      input.end,
      undefined,
      input.access,
    );
    return {
      metricCode: 'BM-FIRST-PASS-YIELD',
      source: 'LEGACY_ROLLBACK',
      totalCount: legacy.totalCount,
      value: legacy.totalCount === 0 ? null : legacy.passRate,
    };
  }

  const dualRun = await executeFirstPassDualRun({
    access: input.access,
    end: input.end,
    scope: input.access?.dataScope?.scopeType ?? 'ALL',
    start: input.start,
  });
  return {
    metricCode: 'BM-FIRST-PASS-YIELD',
    source: 'CANONICAL_ADAPTER',
    totalCount: dualRun.canonicalResult === null ? 0 : 1,
    value: dualRun.canonicalResult as null | number,
  };
}

/**
 * Analytics consumer boundary. Canonical is opt-in; rollback is a single flag
 * decision and leaves the legacy calculation untouched.
 */
export async function getFirstPassYieldForAnalytics(input: {
  access?: AnalyticsAccessContext;
  end: Date;
  start: Date;
  useCanonical: boolean;
}): Promise<FirstPassYieldConsumerResult> {
  if (!input.useCanonical) {
    const legacy = await getLegacyInspectionPassRateSummaryByRange(
      input.start,
      input.end,
      undefined,
      input.access,
    );
    return {
      metricCode: 'BM-FIRST-PASS-YIELD',
      source: 'LEGACY_ROLLBACK',
      value: legacy.totalCount === 0 ? null : legacy.passRate,
    };
  }
  const dualRun = await executeFirstPassDualRun({
    access: input.access,
    end: input.end,
    scope: input.access?.dataScope?.scopeType ?? 'ALL',
    start: input.start,
  });
  return {
    metricCode: 'BM-FIRST-PASS-YIELD',
    source: 'CANONICAL_ADAPTER',
    value: dualRun.canonicalResult as null | number,
  };
}

export async function getFirstPassYieldDashboardTrend(input: {
  access?: AnalyticsAccessContext;
  end: Date;
  start: Date;
  useCanonical: boolean;
}) {
  const points = await getPassRateMonthlyTrend(
    input.start,
    input.end,
    input.access,
  );
  if (input.useCanonical && input.access?.user?.userId) {
    await SystemLogService.recordAuditLog({
      action: 'UPDATE',
      detailsTemplate:
        'Dashboard consumer cutover: {{metricCode}} via canonical adapter; rollback=legacy',
      detailsVariables: { metricCode: 'BM-FIRST-PASS-YIELD' },
      targetId: 'BM-FIRST-PASS-YIELD',
      targetType: 'metric_consumer_cutover',
      userId: input.access.user.userId,
    });
  }
  return points.map((point) => ({
    ...point,
    passRate:
      point.totalCount > 0 ? (point.passCount / point.totalCount) * 100 : null,
  }));
}
