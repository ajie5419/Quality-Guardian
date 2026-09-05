import { describe, expect, it } from 'vitest';

import { validateShadowEnvironment } from './metric-shadow-environment-validation';

describe('shadow environment validation', () => {
  it('blocks without a shadow URL and never falls back', async () => {
    const report = await validateShadowEnvironment({
      adapterAvailable: true,
      databaseUrlShadow: undefined,
      executeReadOnlyCheck: async () => ({
        databaseIdentity: 'should-not-run',
        readonly: true,
        tables: [],
      }),
    });
    expect(report.connectionStatus).toBe('BLOCKED');
    expect(report.unavailableDependencies).toContain(
      'DATABASE_URL_SHADOW_MISSING',
    );
  });

  it('blocks a non-readonly database user', async () => {
    const report = await validateShadowEnvironment({
      adapterAvailable: true,
      databaseUrlShadow: 'mysql://shadow',
      executeReadOnlyCheck: async () => ({
        databaseIdentity: 'shadow-db',
        readonly: false,
        tables: ['inspections'],
      }),
    });
    expect(report.readonlyVerification).toBe('FAIL');
    expect(report.connectionStatus).toBe('BLOCKED');
  });

  it('records identity and available tables for a readonly connection', async () => {
    const report = await validateShadowEnvironment({
      adapterAvailable: true,
      databaseUrlShadow: 'mysql://shadow',
      executeReadOnlyCheck: async () => ({
        databaseIdentity: 'shadow-db',
        readonly: true,
        tables: ['inspections', 'quality_records'],
      }),
      timestamp: new Date('2026-08-21T00:00:00.000Z'),
    });
    expect(report).toMatchObject({
      connectionStatus: 'CONNECTED',
      databaseIdentity: 'shadow-db',
      readonlyVerification: 'PASS',
    });
    expect(report.availableTables).toEqual(['inspections', 'quality_records']);
  });
});
