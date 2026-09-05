import { describe, expect, it } from 'vitest';

import {
  assertShadowValidationEvidence,
  calculateShadowMetric,
} from './metric-shadow-validation';

describe('metric shadow validation', () => {
  it('reports field-level differences', async () => {
    const result = await calculateShadowMetric(
      {
        metricCode: 'BM-FIRST-PASS-YIELD',
        registryDefinition: 'first valid inspection pass ratio',
        sourceQuery: 'inspection records scoped by effective inspection event',
        calculateCurrent: async () => ({ value: 0.8, count: 10 }),
        calculateShadow: async () => ({ value: 0.75, count: 10 }),
      },
      { asOf: new Date('2026-08-21T00:00:00.000Z'), scope: {} },
    );
    expect(result.difference.fields).toEqual([
      { field: 'value', current: 0.8, shadow: 0.75 },
    ]);
  });

  it('requires evidence before activation', () => {
    expect(() => assertShadowValidationEvidence(undefined)).toThrow(
      'SHADOW_VALIDATION_EVIDENCE_REQUIRED',
    );
    expect(() => assertShadowValidationEvidence('snapshot:abc')).not.toThrow();
  });
});
