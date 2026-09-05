import type { MetricCalculationAdapter } from './metric-shadow-validation';

/** Fails closed until the two approved supplier policies are supplied. */
export const supplierScoreAdapter: MetricCalculationAdapter = {
  metricCode: 'BM-SUPPLIER-FINAL-SCORE',
  registryDefinition:
    'final supplier score under the applicable supplier policy',
  sourceQuery: 'SupplierScoreSnapshotService / supplier scoring services',
  calculateCurrent: async () => {
    throw new Error('SUPPLIER_SCORE_POLICY_PENDING');
  },
  calculateShadow: async () => {
    throw new Error('SUPPLIER_SCORE_POLICY_PENDING');
  },
};
