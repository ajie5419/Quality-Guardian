import type { RealShadowContext } from './metric-shadow-adapters';
import type { MetricCalculationAdapter } from './metric-shadow-validation';

/** Uses the existing inspection issue statistics service for both tracks. */
export const problemClosureAdapter: MetricCalculationAdapter = {
  metricCode: 'BM-PROBLEM-CLOSURE-RATE',
  registryDefinition:
    'closed quality problems divided by all quality problems in scope',
  sourceQuery:
    'InspectionIssueStatsService.getIssueStats({ year, userContext })',
  calculateCurrent: async (input) => {
    // Import the query service directly. Importing the inspection barrel would
    // re-enter InspectionCoreService and create a module initialization cycle.
    const { InspectionIssueStatsService } = await import(
      '~/modules/inspection/inspection-issue-stats.service'
    );
    const context = input as RealShadowContext;
    const stats = await InspectionIssueStatsService.getIssueStats({
      year: context.asOf.getUTCFullYear(),
      userContext: context.access?.user,
    });
    return stats.totalCount === 0 ? null : stats.closedCount / stats.totalCount;
  },
  calculateShadow: async (input) => {
    const { InspectionIssueStatsService } = await import(
      '~/modules/inspection/inspection-issue-stats.service'
    );
    const context = input as RealShadowContext;
    const stats = await InspectionIssueStatsService.getIssueStats({
      year: context.asOf.getUTCFullYear(),
      userContext: context.access?.user,
    });
    return stats.totalCount === 0 ? null : stats.closedCount / stats.totalCount;
  },
};
