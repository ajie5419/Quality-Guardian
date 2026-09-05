import type { AnalyticsAccessContext } from '~/modules/data-scope';

import type {
  MetricCalculationAdapter,
  ShadowCalculationContext,
} from './metric-shadow-validation';

import { problemClosureAdapter } from './metric-problem-closure-adapter';
import { reinspectionAdapter } from './metric-reinspection-adapter';
import { supplierScoreAdapter } from './metric-supplier-score-adapter';
import { vehicleFailureAdapter } from './metric-vehicle-failure-adapter';

export interface RealShadowContext extends ShadowCalculationContext {
  access?: AnalyticsAccessContext;
  end: Date;
  start: Date;
}

export interface ShadowEvidence {
  calculatedAt: string;
  diff: {
    fields: Array<{ current: unknown; field: string; shadow: unknown }>;
    status: ShadowDiffStatus;
  };
  metricCode: string;
  result: { canonical: unknown; current: unknown };
  source: string;
  version: string;
}

export type ShadowDiffStatus =
  | 'BLOCKED'
  | 'BUSINESS_REVIEW_REQUIRED'
  | 'MATCH'
  | 'MINOR_DIFF';

function classify(
  fields: Array<{ current: unknown; field: string; shadow: unknown }>,
): ShadowDiffStatus {
  if (fields.length === 0) return 'MATCH';
  if (
    fields.length <= 1 &&
    fields.every(
      (field) =>
        typeof field.current === 'number' && typeof field.shadow === 'number',
    )
  )
    return 'MINOR_DIFF';
  return 'BUSINESS_REVIEW_REQUIRED';
}

function normalizeFirstPassDifference(
  fields: Array<{ current: unknown; field: string; shadow: unknown }>,
) {
  return fields.filter((field) => {
    if (typeof field.current !== 'number' || typeof field.shadow !== 'number')
      return true;
    return Math.round(field.current * 100) !== Math.round(field.shadow * 100);
  });
}

function asRealContext(context: ShadowCalculationContext): RealShadowContext {
  if (!('start' in context) || !('end' in context))
    throw new Error('SHADOW_CONTEXT_RANGE_REQUIRED');
  return context as RealShadowContext;
}

const qualityLoss: MetricCalculationAdapter = {
  metricCode: 'BM-GROSS-QUALITY-LOSS',
  registryDefinition: 'quality loss amount incurred in the reporting scope',
  sourceQuery: 'QualityLossService.getTrendData(month, access scope)',
  calculateCurrent: async (input) => {
    const context = asRealContext(input);
    const { QualityLossService } = await import('~/modules/quality-loss');
    const result = await QualityLossService.getTrendData(
      'month',
      context.access?.user,
      context.access?.dataScope,
    );
    return result.trend.reduce(
      (sum, item) => sum + Number(item.totalAmount ?? 0),
      0,
    );
  },
  calculateShadow: async (input) => {
    const context = asRealContext(input);
    const { QualityLossService } = await import('~/modules/quality-loss');
    const result = await QualityLossService.getTrendData(
      'month',
      context.access?.user,
      context.access?.dataScope,
    );
    return result.trend.reduce(
      (sum, item) => sum + Number(item.totalAmount ?? 0),
      0,
    );
  },
};

const firstPass: MetricCalculationAdapter = {
  metricCode: 'BM-FIRST-PASS-YIELD',
  registryDefinition:
    'first valid inspection pass quantity divided by first valid inspection quantity',
  sourceQuery: 'getLegacyInspectionPassRateSummaryByRange(start, end, access)',
  calculateCurrent: async (input) => {
    const context = asRealContext(input);
    const { getLegacyInspectionPassRateSummaryByRange } = await import(
      '~/modules/report'
    );
    const summary = await getLegacyInspectionPassRateSummaryByRange(
      context.start,
      context.end,
      undefined,
      context.access,
    );
    return summary.totalCount === 0 ? null : summary.passRate;
  },
  calculateShadow: async (input) => {
    const context = asRealContext(input);
    const { getLegacyInspectionPassRateSummaryByRange } = await import(
      '~/modules/report'
    );
    const summary = await getLegacyInspectionPassRateSummaryByRange(
      context.start,
      context.end,
      undefined,
      context.access,
    );
    return summary.totalCount === 0
      ? null
      : (summary.passCount / summary.totalCount) * 100;
  },
};

const problemClosure: MetricCalculationAdapter = {
  metricCode: 'BM-PROBLEM-CLOSURE-RATE',
  registryDefinition:
    'closed quality problems divided by all quality problems in scope',
  sourceQuery:
    'InspectionIssueStatsService.getIssueStats({ year, userContext })',
  calculateCurrent: async (input) => {
    const context = asRealContext(input);
    const { InspectionIssueStatsService } = await import(
      '~/modules/inspection'
    );
    const stats = await InspectionIssueStatsService.getIssueStats({
      year: context.asOf.getUTCFullYear(),
      userContext: context.access?.user,
    });
    return stats.totalCount === 0 ? null : stats.closedCount / stats.totalCount;
  },
  calculateShadow: async (input) => {
    const context = asRealContext(input);
    const { InspectionIssueStatsService } = await import(
      '~/modules/inspection'
    );
    const stats = await InspectionIssueStatsService.getIssueStats({
      year: context.asOf.getUTCFullYear(),
      userContext: context.access?.user,
    });
    return stats.totalCount === 0 ? null : stats.closedCount / stats.totalCount;
  },
};

export const METRIC_CALCULATION_ADAPTERS: Record<
  string,
  MetricCalculationAdapter
> = {
  [qualityLoss.metricCode]: qualityLoss,
  [firstPass.metricCode]: firstPass,
  [problemClosure.metricCode]: problemClosure,
  [problemClosureAdapter.metricCode]: problemClosureAdapter,
  [supplierScoreAdapter.metricCode]: supplierScoreAdapter,
  [reinspectionAdapter.metricCode]: reinspectionAdapter,
  [vehicleFailureAdapter.metricCode]: vehicleFailureAdapter,
};

export function buildShadowEvidence(
  snapshot: {
    calculatedAt: string;
    currentCalculation: unknown;
    difference: {
      equal: boolean;
      fields: Array<{ current: unknown; field: string; shadow: unknown }>;
    };
    metricCode: string;
    shadowCalculation: unknown;
  },
  version = 'v1',
): ShadowEvidence {
  const fields =
    snapshot.metricCode === 'BM-FIRST-PASS-YIELD'
      ? normalizeFirstPassDifference(snapshot.difference.fields)
      : snapshot.difference.fields;
  return {
    calculatedAt: snapshot.calculatedAt,
    diff: {
      fields,
      status: classify(fields),
    },
    metricCode: snapshot.metricCode,
    result: {
      canonical: snapshot.shadowCalculation,
      current: snapshot.currentCalculation,
    },
    source:
      METRIC_CALCULATION_ADAPTERS[snapshot.metricCode]?.sourceQuery ??
      'registered adapter',
    version,
  };
}
