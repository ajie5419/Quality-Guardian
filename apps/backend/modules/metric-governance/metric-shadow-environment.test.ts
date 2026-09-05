import { describe, expect, it } from 'vitest';

import { checkShadowEnvironment } from './metric-shadow-environment';

const base = {
  accessScopeValid: true,
  endDate: new Date('2026-08-21T00:00:00.000Z'),
  metricCode: 'BM-FIRST-PASS-YIELD',
  startDate: new Date('2025-08-21T00:00:00.000Z'),
};

describe('shadow environment preflight', () => {
  it('blocks when the shadow database is missing', () => {
    const result = checkShadowEnvironment(
      { ...base, scope: 'ALL' },
      { adapterExists: true },
    );
    expect(result.reasons).toContain('DATABASE_URL_SHADOW_MISSING');
    expect(result.reasons).toContain('SHADOW_EXECUTOR_UNAVAILABLE');
  });

  it('blocks missing caller access for DEPT and SELF', () => {
    const options = {
      adapterExists: true,
      shadowDatabaseIsolated: true,
      shadowDatabaseReadOnly: true,
      shadowDatabaseUrl: 'mysql://shadow',
      shadowExecutorAvailable: true,
    };
    expect(
      checkShadowEnvironment(
        { ...base, accessScopeValid: false, scope: 'DEPT' },
        options,
      ).blocked,
    ).toBe(true);
    expect(
      checkShadowEnvironment(
        { ...base, accessScopeValid: false, scope: 'SELF' },
        options,
      ).blocked,
    ).toBe(true);
  });

  it('requires an isolated, readonly executor in addition to the URL', () => {
    const options = {
      adapterExists: true,
      shadowDatabaseUrl: 'mysql://shadow',
    };
    expect(
      checkShadowEnvironment({ ...base, scope: 'ALL' }, options).reasons,
    ).toContain('SHADOW_EXECUTOR_UNAVAILABLE');
  });

  it('allows every scope only with a verified isolated, readonly executor', () => {
    const options = {
      adapterExists: true,
      shadowDatabaseIsolated: true,
      shadowDatabaseReadOnly: true,
      shadowDatabaseUrl: 'mysql://shadow',
      shadowExecutorAvailable: true,
    };
    expect(
      checkShadowEnvironment({ ...base, scope: 'ALL' }, options).blocked,
    ).toBe(false);
    expect(
      checkShadowEnvironment({ ...base, scope: 'DEPT' }, options).blocked,
    ).toBe(false);
    expect(
      checkShadowEnvironment({ ...base, scope: 'SELF' }, options).blocked,
    ).toBe(false);
  });
});
