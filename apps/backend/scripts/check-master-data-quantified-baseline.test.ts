import { describe, expect, it } from 'vitest';

import { runQuantifiedBaselineCheck } from './check-master-data-quantified-baseline';

describe('check-master-data-quantified-baseline', () => {
  it('passes when quantified values match the baseline', async () => {
    const result = await runQuantifiedBaselineCheck({
      repoRoot: '/tmp/repo',
      pickLatestReportPath: async () => '/tmp/repo/report.json',
      readJson: async () => ({
        quantified: {
          total_fields: 47,
          canonical_fields: 37,
          name_only_fields: 10,
          excluded_total: 17,
          excluded_system_metadata: 7,
          excluded_business_excluded: 9,
          excluded_canonical_source: 0,
          excluded_covered_by_governance: 0,
          excluded_other: 1,
        },
      }),
      runObjectiveAudit: async () => undefined,
    });

    expect(result.pass).toBe(true);
    expect(result.mismatches).toHaveLength(0);
    expect(result.reportPath).toBe('/tmp/repo/report.json');
  });

  it('fails when quantified values differ from the baseline', async () => {
    const result = await runQuantifiedBaselineCheck({
      repoRoot: '/tmp/repo',
      pickLatestReportPath: async () => '/tmp/repo/report.json',
      readJson: async () => ({
        quantified: {
          total_fields: 48,
          canonical_fields: 37,
          name_only_fields: 10,
          excluded_total: 17,
          excluded_system_metadata: 7,
          excluded_business_excluded: 9,
          excluded_canonical_source: 0,
          excluded_covered_by_governance: 0,
          excluded_other: 1,
        },
      }),
      runObjectiveAudit: async () => undefined,
    });

    expect(result.pass).toBe(false);
    expect(result.mismatches).toContain('total_fields: expected=47, actual=48');
  });
});
