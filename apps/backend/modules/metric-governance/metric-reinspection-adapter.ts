import type { MetricCalculationAdapter } from './metric-shadow-validation';

/** Fails closed until request revision and deduplication policy is stable. */
export const reinspectionAdapter: MetricCalculationAdapter = {
  metricCode: 'BM-REINSPECTION-RATE',
  registryDefinition:
    'request-level reinspection events divided by eligible inspections',
  sourceQuery: 'InspectionRequestStatsService reinspection aggregates',
  calculateCurrent: async () => {
    throw new Error('REINSPECTION_REVISION_POLICY_PENDING');
  },
  calculateShadow: async () => {
    throw new Error('REINSPECTION_REVISION_POLICY_PENDING');
  },
};
