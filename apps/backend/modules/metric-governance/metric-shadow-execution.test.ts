import type {
  MetricCalculationAdapter,
  ShadowCalculationContext,
} from './metric-shadow-validation';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { METRIC_CALCULATION_ADAPTERS } from './metric-shadow-adapters';
import {
  defaultShadowExecutionWindow,
  executeShadowMetric,
} from './metric-shadow-execution';

afterEach(() => {
  delete METRIC_CALCULATION_ADAPTERS['BM-SHADOW-TEST'];
  vi.unstubAllEnvs();
});

describe('controlled shadow execution', () => {
  it('uses a rolling twelve-month window', () => {
    const window = defaultShadowExecutionWindow(
      new Date('2026-08-21T00:00:00.000Z'),
    );
    expect(window.start.toISOString()).toBe('2025-08-21T00:00:00.000Z');
    expect(window.end.toISOString()).toBe('2026-08-21T00:00:00.000Z');
  });

  it('fails closed when an adapter is unavailable', async () => {
    const result = await executeShadowMetric('UNKNOWN', 'ALL');
    expect(result.classification).toBe('BLOCKED');
  });

  it('uses an isolated executor and retains both values when the result matches', async () => {
    vi.stubEnv('DATABASE_URL_SHADOW', 'mysql://shadow');
    const calculateShadow = vi.fn(
      async (
        _adapter: MetricCalculationAdapter,
        _context: ShadowCalculationContext,
      ) => 7,
    );
    METRIC_CALCULATION_ADAPTERS['BM-SHADOW-TEST'] = {
      calculateCurrent: async () => 7,
      calculateShadow: async () => {
        throw new Error('default shadow adapter must not run');
      },
      metricCode: 'BM-SHADOW-TEST',
      registryDefinition: 'test metric',
      sourceQuery: 'test source',
    };

    const result = await executeShadowMetric(
      'BM-SHADOW-TEST',
      'DEPT',
      {
        end: new Date('2026-08-21T00:00:00.000Z'),
        start: new Date('2025-08-21T00:00:00.000Z'),
      },
      'v1',
      {
        user: { userId: 'user-1' },
        dataScope: { scopeType: 'DEPT', deptIds: ['dept-1'] } as never,
      },
      {
        calculateShadow,
        primaryDatabaseIdentity: 'primary-db',
        shadowDatabaseIdentity: 'shadow-db',
        shadowDatabaseReadOnly: true,
      },
    );

    expect(calculateShadow).toHaveBeenCalledTimes(1);
    expect(calculateShadow.mock.calls[0]?.[1]).toMatchObject({
      access: {
        dataScope: { deptIds: ['dept-1'], scopeType: 'DEPT' },
        user: { userId: 'user-1' },
      },
    });
    expect(result).toMatchObject({
      classification: 'MATCH',
      result: { canonical: 7, current: 7 },
    });
  });

  it('blocks same-database executors before any calculation runs', async () => {
    vi.stubEnv('DATABASE_URL_SHADOW', 'mysql://shadow');
    const calculateShadow = vi.fn(
      async (
        _adapter: MetricCalculationAdapter,
        _context: ShadowCalculationContext,
      ) => 7,
    );
    METRIC_CALCULATION_ADAPTERS['BM-SHADOW-TEST'] = {
      calculateCurrent: async () => 7,
      calculateShadow: async () => 7,
      metricCode: 'BM-SHADOW-TEST',
      registryDefinition: 'test metric',
      sourceQuery: 'test source',
    };

    const result = await executeShadowMetric(
      'BM-SHADOW-TEST',
      'ALL',
      undefined,
      'v1',
      { user: { userId: 'user-1' } },
      {
        calculateShadow,
        primaryDatabaseIdentity: 'primary-db',
        shadowDatabaseIdentity: 'primary-db',
        shadowDatabaseReadOnly: true,
      },
    );

    expect(result).toMatchObject({ classification: 'BLOCKED' });
    expect(result.issue).toContain('SHADOW_DATABASE_NOT_ISOLATED');
    expect(calculateShadow).not.toHaveBeenCalled();
  });
});
