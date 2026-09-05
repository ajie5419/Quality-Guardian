import { describe, expect, it } from 'vitest';

import { METRIC_CALCULATION_ADAPTERS } from './metric-shadow-adapters';

describe('metric calculation adapter registry', () => {
  it('registers the first real adapter batch', () => {
    expect(Object.keys(METRIC_CALCULATION_ADAPTERS).sort()).toEqual([
      'BM-FIRST-PASS-YIELD',
      'BM-GROSS-QUALITY-LOSS',
      'BM-PROBLEM-CLOSURE-RATE',
      'BM-REINSPECTION-RATE',
      'BM-SUPPLIER-FINAL-SCORE',
      'BM-VEHICLE-FAILURE-COUNT',
    ]);
    for (const adapter of Object.values(METRIC_CALCULATION_ADAPTERS)) {
      expect(adapter.sourceQuery).toBeTruthy();
      expect(adapter.calculateCurrent).toBeTypeOf('function');
      expect(adapter.calculateShadow).toBeTypeOf('function');
    }
  });
});
