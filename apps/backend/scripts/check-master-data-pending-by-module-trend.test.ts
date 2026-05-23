import { describe, expect, it } from 'vitest';

import {
  evaluatePendingByModuleTrend,
  parsePendingByModuleSummary,
} from './check-master-data-pending-by-module-trend';

describe('check-master-data-pending-by-module-trend', () => {
  it('passes when pending and excluded do not increase and undecided stays zero', () => {
    const before = parsePendingByModuleSummary(
      {
        modules: [
          { moduleKey: 'system', pendingCount: 11 },
          { moduleKey: 'supervision', pendingCount: 9 },
        ],
        summary: {
          totalPending: 25,
          totalExcluded: 25,
          totalUndecided: 0,
        },
      },
      'before.json',
    );

    const after = parsePendingByModuleSummary(
      {
        modules: [
          { moduleKey: 'system', pendingCount: 10 },
          { moduleKey: 'supervision', pendingCount: 9 },
        ],
        summary: {
          totalPending: 24,
          totalExcluded: 25,
          totalUndecided: 0,
        },
      },
      'after.json',
    );

    const result = evaluatePendingByModuleTrend(before, after);

    expect(result.pass).toBe(true);
    expect(result.failReasons).toHaveLength(0);
    expect(result.checks).toEqual({
      moduleBreakdownNonIncreasing: true,
      totalPendingNonIncreasing: true,
      totalExcludedNonIncreasing: true,
      totalUndecidedZero: true,
    });
  });

  it('fails when excluded increases or undecided is not zero', () => {
    const before = parsePendingByModuleSummary(
      {
        modules: [
          { moduleKey: 'system', pendingCount: 10 },
          { moduleKey: 'supervision', pendingCount: 9 },
        ],
        summary: {
          totalPending: 25,
          totalExcluded: 25,
          totalUndecided: 0,
        },
      },
      'before.json',
    );

    const after = parsePendingByModuleSummary(
      {
        modules: [
          { moduleKey: 'system', pendingCount: 11 },
          { moduleKey: 'supervision', pendingCount: 9 },
        ],
        summary: {
          totalPending: 25,
          totalExcluded: 26,
          totalUndecided: 1,
        },
      },
      'after.json',
    );

    const result = evaluatePendingByModuleTrend(before, after);

    expect(result.pass).toBe(false);
    expect(result.checks.moduleBreakdownNonIncreasing).toBe(false);
    expect(result.checks.totalPendingNonIncreasing).toBe(true);
    expect(result.checks.totalExcludedNonIncreasing).toBe(false);
    expect(result.checks.totalUndecidedZero).toBe(false);
    expect(result.failReasons).toContain(
      'totalExcluded increased: before=25, after=26',
    );
    expect(result.failReasons).toContain(
      'totalUndecided must stay 0: before=0, after=1',
    );
    expect(result.failReasons).toContain(
      'module pending increased: system before=10, after=11',
    );
  });
});
