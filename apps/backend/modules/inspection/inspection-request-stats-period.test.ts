import type {
  PeriodClosedGroup,
  PeriodRequestRow,
  PeriodRequestStatsContext,
  PeriodSubmittedGroup,
} from './inspection-request-stats-period';

import { describe, expect, it } from 'vitest';

import { createInspectionRequestStatsAccumulator } from './inspection-request-stats-accumulator';
import {
  inspectionRequestDurationMinutes as durationMinutes,
  formatInspectionRequestStatsDate as formatShanghaiDate,
} from './inspection-request-stats-date';
import {
  accumulatePeriodRequestRows,
  applyPeriodClosedGroup,
  applyPeriodSubmittedGroup,
  classifyPeriodClosedRow,
  classifyPeriodSubmittedRow,
} from './inspection-request-stats-period';

// Three Shanghai-midnight days so cross-day bucketing is exercised.
const range = {
  end: new Date('2026-06-04T00:00:00+08:00'),
  start: new Date('2026-06-01T00:00:00+08:00'),
};

const emptyContext: PeriodRequestStatsContext = {
  processDepartmentsById: new Map(),
  teamCanonicalById: new Map(),
};

function makeRow(
  overrides: Partial<PeriodRequestRow> & { id?: string } = {},
): PeriodRequestRow {
  return {
    category: 'PROCESS',
    closedAt: null,
    dispatchedAt: null,
    inspectionResult: 'PASS',
    inspectorId: null,
    linkedIssueId: null,
    linkedIssueNo: null,
    processId: null,
    responsibilityType: null,
    responsibleDepartmentId: null,
    status: 'SUBMITTED',
    submittedAt: new Date('2026-06-01T10:00:00+08:00'),
    supplierId: null,
    teamId: 'team-a',
    ...overrides,
  };
}

/**
 * Test-side mirror of the DB GROUP BY (PERF-QMS-001 / PHASE-2A). Keys cover
 * every classification dimension read by classifyPeriodSubmittedRow /
 * classifyPeriodClosedRow, so applying a group with its requestCount must
 * equal applying every row individually.
 */
function groupRows(rows: PeriodRequestRow[]) {
  const submitted = new Map<string, PeriodSubmittedGroup>();
  const closed = new Map<string, PeriodClosedGroup>();
  for (const row of rows) {
    if (
      row.submittedAt >= range.start &&
      row.submittedAt < range.end &&
      row.status !== 'CANCELLED'
    ) {
      const group = {
        category: row.category,
        hasLinkedIssue: Boolean(row.linkedIssueId || row.linkedIssueNo),
        inspectionResult: row.inspectionResult,
        processId: row.processId,
        requestCount: 1,
        responsibilityType: row.responsibilityType,
        responsibleDepartmentId: row.responsibleDepartmentId,
        status: row.status,
        submittedDate: formatShanghaiDate(row.submittedAt),
        supplierId: row.supplierId,
        teamId: row.teamId,
      };
      const key = JSON.stringify([
        group.submittedDate,
        group.category,
        group.responsibilityType,
        group.supplierId,
        group.teamId,
        group.responsibleDepartmentId,
        group.processId,
        group.status,
        group.inspectionResult,
        group.hasLinkedIssue,
      ]);
      const existing = submitted.get(key);
      if (existing) existing.requestCount += 1;
      else submitted.set(key, group);
    }
    if (
      row.closedAt &&
      row.closedAt >= range.start &&
      row.closedAt < range.end &&
      row.status === 'CLOSED'
    ) {
      const group = {
        category: row.category,
        closedDate: formatShanghaiDate(row.closedAt),
        inspectorId: row.inspectorId,
        inspectorRealName: null,
        inspectorUsername: null,
        requestCount: 1,
        supplierId: row.supplierId,
        teamId: row.teamId,
        totalTaskMinutes: durationMinutes(
          row.dispatchedAt || row.submittedAt,
          row.closedAt,
        ),
      };
      const key = JSON.stringify([
        group.closedDate,
        group.category,
        group.supplierId,
        group.teamId,
        group.inspectorId,
        group.inspectorRealName,
        group.inspectorUsername,
      ]);
      const existing = closed.get(key);
      if (existing) {
        existing.requestCount += 1;
        existing.totalTaskMinutes += group.totalTaskMinutes;
      } else {
        closed.set(key, group);
      }
    }
  }
  return { closed: [...closed.values()], submitted: [...submitted.values()] };
}

function applyGroups(
  accumulator: ReturnType<typeof createInspectionRequestStatsAccumulator>,
  groups: { closed: PeriodClosedGroup[]; submitted: PeriodSubmittedGroup[] },
  context: PeriodRequestStatsContext,
) {
  for (const group of groups.submitted) {
    applyPeriodSubmittedGroup(
      accumulator,
      classifyPeriodSubmittedRow(
        {
          category: group.category,
          hasLinkedIssue: group.hasLinkedIssue,
          inspectionResult: group.inspectionResult,
          processId: group.processId,
          responsibilityType: group.responsibilityType,
          responsibleDepartmentId: group.responsibleDepartmentId,
          status: group.status,
          supplierId: group.supplierId,
          teamId: group.teamId,
        },
        context,
        group.submittedDate,
      ),
      group.requestCount,
    );
  }
  for (const group of groups.closed) {
    applyPeriodClosedGroup(
      accumulator,
      classifyPeriodClosedRow(
        {
          category: group.category,
          inspectorId: group.inspectorId,
          supplierId: group.supplierId,
          teamId: group.teamId,
        },
        group.closedDate,
      ),
      group.requestCount,
      group.totalTaskMinutes,
    );
  }
}

function toPlain(
  accumulator: ReturnType<typeof createInspectionRequestStatsAccumulator>,
) {
  const sortObject = (value: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(value).sort(([a], [b]) => a.localeCompare(b)),
    );
  return {
    counters: accumulator.counters,
    dailyTrend: sortObject(Object.fromEntries(accumulator.dailyTrendMap)),
    departmentMap: sortObject(Object.fromEntries(accumulator.departmentMap)),
    departmentReinspectionMap: sortObject(
      Object.fromEntries(accumulator.departmentReinspectionMap),
    ),
    historyDepartmentMap: sortObject(
      Object.fromEntries(accumulator.historyDepartmentMap),
    ),
    historyInspectorMap: sortObject(
      Object.fromEntries(accumulator.historyInspectorMap),
    ),
    historyTeamMap: sortObject(Object.fromEntries(accumulator.historyTeamMap)),
    inspectorMap: sortObject(Object.fromEntries(accumulator.inspectorMap)),
    supplierMap: sortObject(Object.fromEntries(accumulator.supplierMap)),
    supplierReinspectionMap: sortObject(
      Object.fromEntries(accumulator.supplierReinspectionMap),
    ),
    teamMap: sortObject(Object.fromEntries(accumulator.teamMap)),
    teamReinspectionMap: sortObject(
      Object.fromEntries(accumulator.teamReinspectionMap),
    ),
  };
}

describe('inspection-request-stats-period (PERF-QMS-001 / PHASE-2A oracle)', () => {
  it('produces identical accumulators on an empty fixture', () => {
    const oracle = createInspectionRequestStatsAccumulator(
      range.start,
      range.end,
    );
    const grouped = createInspectionRequestStatsAccumulator(
      range.start,
      range.end,
    );
    accumulatePeriodRequestRows(
      oracle,
      [],
      emptyContext,
      range.start,
      range.end,
    );
    applyGroups(grouped, groupRows([]), emptyContext);
    expect(toPlain(grouped)).toEqual(toPlain(oracle));
    expect(oracle.counters.todaySubmittedCount).toBe(0);
    expect(oracle.counters.todayClosedCount).toBe(0);
  });

  it('group path equals per-row path on a diverse multi-bucket fixture', () => {
    const rows: PeriodRequestRow[] = [
      // Internal PROCESS row with TEAM.
      makeRow({ id: 'r1', teamId: 'team-a' }),
      // Second internal row in a different bucket (different day).
      makeRow({
        id: 'r2',
        submittedAt: new Date('2026-06-02T09:00:00+08:00'),
        teamId: 'team-a',
      }),
      // INCOMING supplier row.
      makeRow({
        category: 'INCOMING',
        id: 'r3',
        status: 'CLOSED',
        supplierId: 'supplier-x',
        teamId: null,
        closedAt: new Date('2026-06-01T12:00:00+08:00'),
      }),
      // CLOSED internal FAIL with linked issue (reinspection both buckets).
      makeRow({
        id: 'r4',
        status: 'CLOSED',
        closedAt: new Date('2026-06-01T13:00:00+08:00'),
        dispatchedAt: new Date('2026-06-01T11:30:00+08:00'),
        inspectionResult: 'FAIL',
        linkedIssueId: 'issue-1',
        teamId: 'team-b',
      }),
      // CANCELLED row must stay out of the submitted bucket.
      makeRow({ id: 'r5', status: 'CANCELLED', teamId: 'team-a' }),
      // Closed-only row (submittedAt before the range): counts closed only.
      makeRow({
        id: 'r6',
        status: 'CLOSED',
        submittedAt: new Date('2026-05-31T10:00:00+08:00'),
        closedAt: new Date('2026-06-02T10:00:00+08:00'),
        dispatchedAt: new Date('2026-06-02T09:00:00+08:00'),
        inspectorId: 'inspector-1',
      }),
      // Submitted-only row (closedAt after the range): counts submitted only.
      makeRow({
        id: 'r7',
        status: 'CLOSED',
        closedAt: new Date('2026-06-05T10:00:00+08:00'),
        inspectorId: 'inspector-2',
      }),
      // Negative duration row: durationMinutes clamps to 0.
      makeRow({
        id: 'r8',
        status: 'CLOSED',
        closedAt: new Date('2026-06-03T09:00:00+08:00'),
        dispatchedAt: new Date('2026-06-03T11:00:00+08:00'),
        inspectorId: 'inspector-1',
      }),
      // Boundary row exactly at start: submitted bucket includes it.
      makeRow({
        id: 'r9',
        submittedAt: new Date('2026-06-01T00:00:00+08:00'),
        teamId: 'team-a',
      }),
      // Legacy category-null row with supplier + team stays internal.
      makeRow({
        category: null,
        id: 'r10',
        supplierId: 'supplier-y',
        teamId: 'team-a',
      }),
      // No-identity rows fall into the unresolved buckets.
      makeRow({
        category: 'INCOMING',
        id: 'r11',
        supplierId: null,
        teamId: null,
      }),
    ];
    const context: PeriodRequestStatsContext = {
      processDepartmentsById: new Map([['proc-machining', 'dept-machining']]),
      teamCanonicalById: new Map([['team-legacy', 'team-a']]),
    };
    rows.push(
      // Process-fallback + canonical-team legacy rows.
      makeRow({
        id: 'r12',
        processId: 'proc-machining',
        responsibleDepartmentId: null,
        teamId: null,
      }),
      makeRow({ id: 'r13', teamId: 'team-legacy' }),
    );

    const oracle = createInspectionRequestStatsAccumulator(
      range.start,
      range.end,
    );
    const grouped = createInspectionRequestStatsAccumulator(
      range.start,
      range.end,
    );
    accumulatePeriodRequestRows(oracle, rows, context, range.start, range.end);
    applyGroups(grouped, groupRows(rows), context);
    expect(toPlain(grouped)).toEqual(toPlain(oracle));
  });

  it('applies the count multiplier and sums durations for identical group rows', () => {
    const rows = [
      makeRow({
        id: 'a',
        status: 'CLOSED',
        closedAt: new Date('2026-06-01T12:00:00+08:00'),
        dispatchedAt: new Date('2026-06-01T10:30:00+08:00'),
        inspectorId: 'inspector-1',
        teamId: 'team-a',
      }),
      makeRow({
        id: 'b',
        status: 'CLOSED',
        closedAt: new Date('2026-06-01T12:00:00+08:00'),
        dispatchedAt: new Date('2026-06-01T11:00:00+08:00'),
        inspectorId: 'inspector-1',
        teamId: 'team-a',
      }),
    ];
    const groups = groupRows(rows);
    expect(groups.submitted).toHaveLength(1);
    expect(groups.submitted[0].requestCount).toBe(2);
    expect(groups.closed).toHaveLength(1);
    expect(groups.closed[0].requestCount).toBe(2);
    // 90 + 60 minutes.
    expect(groups.closed[0].totalTaskMinutes).toBe(150);

    const accumulator = createInspectionRequestStatsAccumulator(
      range.start,
      range.end,
    );
    applyGroups(accumulator, groups, emptyContext);
    expect(accumulator.counters.todaySubmittedCount).toBe(2);
    expect(accumulator.counters.todayClosedCount).toBe(2);
    expect(accumulator.historyInspectorMap.get('inspector-1')).toEqual({
      averageTaskMinutes: 75,
      completedTaskCount: 2,
      totalTaskMinutes: 150,
    });
    expect(accumulator.inspectorMap.get('inspector-1')).toBe(2);
  });

  it('classifies submitted rows into the correct identity buckets', () => {
    const accumulator = createInspectionRequestStatsAccumulator(
      range.start,
      range.end,
    );
    const context: PeriodRequestStatsContext = {
      processDepartmentsById: new Map([['proc-x', 'dept-process']]),
      teamCanonicalById: new Map([['team-legacy', 'team-a']]),
    };
    const groups = {
      closed: [] as PeriodClosedGroup[],
      submitted: [
        {
          category: 'INCOMING' as const,
          hasLinkedIssue: false,
          inspectionResult: 'PASS',
          processId: null,
          requestCount: 1,
          responsibilityType: 'SUPPLIER',
          responsibleDepartmentId: null,
          status: 'SUBMITTED',
          submittedDate: '2026-06-01',
          supplierId: 'supplier-x',
          teamId: null,
        },
        {
          category: 'PROCESS' as const,
          hasLinkedIssue: true,
          inspectionResult: 'FAIL',
          processId: 'proc-x',
          requestCount: 2,
          responsibilityType: 'INTERNAL_DEPARTMENT',
          responsibleDepartmentId: null,
          status: 'CLOSED',
          submittedDate: '2026-06-01',
          supplierId: null,
          teamId: null,
        },
        {
          category: 'PROCESS' as const,
          hasLinkedIssue: false,
          inspectionResult: 'PASS',
          processId: null,
          requestCount: 1,
          responsibilityType: 'INTERNAL_DEPARTMENT',
          responsibleDepartmentId: 'dept-direct',
          status: 'SUBMITTED',
          submittedDate: '2026-06-02',
          supplierId: null,
          teamId: 'team-legacy',
        },
      ],
    };
    applyGroups(accumulator, groups, context);

    expect(accumulator.counters.todaySubmittedIncomingCount).toBe(1);
    expect(accumulator.counters.todaySubmittedProcessCount).toBe(3);
    expect(accumulator.supplierMap.get('supplier-x')).toBe(1);
    // Process-fallback department key from the process master map.
    expect(accumulator.departmentMap.get('dept-process')).toBe(2);
    // Direct snapshot department wins over the process map.
    expect(accumulator.departmentMap.get('dept-direct')).toBe(1);
    // Canonical team id applies to the legacy team row.
    expect(accumulator.teamMap.get('team-a')).toBe(1);
    // Closed FAIL + linked issue counts as reinspection, multiplier = 2.
    expect(accumulator.departmentReinspectionMap.get('dept-process')).toEqual({
      inspectedCount: 2,
      reinspectionCount: 2,
      submittedCount: 2,
    });
    expect(accumulator.dailyTrendMap.get('2026-06-01')).toMatchObject({
      submittedCount: 3,
    });
    expect(accumulator.dailyTrendMap.get('2026-06-02')).toMatchObject({
      submittedCount: 1,
    });
  });

  it('clamps negative durations and keeps unresolved inspectors in one bucket', () => {
    const rows = [
      makeRow({
        id: 'neg',
        status: 'CLOSED',
        closedAt: new Date('2026-06-01T10:00:00+08:00'),
        dispatchedAt: new Date('2026-06-01T12:00:00+08:00'),
        inspectorId: 'inspector-1',
      }),
      makeRow({
        id: 'no-id',
        status: 'CLOSED',
        closedAt: new Date('2026-06-01T11:00:00+08:00'),
        inspectorId: null,
      }),
    ];
    const oracle = createInspectionRequestStatsAccumulator(
      range.start,
      range.end,
    );
    const grouped = createInspectionRequestStatsAccumulator(
      range.start,
      range.end,
    );
    accumulatePeriodRequestRows(
      oracle,
      rows,
      emptyContext,
      range.start,
      range.end,
    );
    applyGroups(grouped, groupRows(rows), emptyContext);
    expect(toPlain(grouped)).toEqual(toPlain(oracle));
    expect(oracle.historyInspectorMap.get('inspector-1')).toMatchObject({
      completedTaskCount: 1,
      totalTaskMinutes: 0,
    });
    expect(oracle.inspectorMap.get('')).toBe(1);
  });

  it('ignores zero and negative group counts', () => {
    const accumulator = createInspectionRequestStatsAccumulator(
      range.start,
      range.end,
    );
    const classification = classifyPeriodSubmittedRow(
      {
        category: 'PROCESS',
        hasLinkedIssue: false,
        inspectionResult: 'PASS',
        processId: null,
        responsibilityType: null,
        responsibleDepartmentId: null,
        status: 'SUBMITTED',
        supplierId: null,
        teamId: 'team-a',
      },
      emptyContext,
      '2026-06-01',
    );
    applyPeriodSubmittedGroup(accumulator, classification, 0);
    applyPeriodSubmittedGroup(accumulator, classification, -1);
    expect(accumulator.counters.todaySubmittedCount).toBe(0);
    expect(accumulator.teamMap.size).toBe(0);
  });

  it('classifies closed rows with the incoming/supplier vs process domain rule', () => {
    const incoming = classifyPeriodClosedRow(
      {
        category: 'INCOMING',
        inspectorId: 'inspector-1',
        supplierId: 'supplier-x',
        teamId: null,
      },
      '2026-06-01',
    );
    expect(incoming.closedIsIncoming).toBe(true);

    const process = classifyPeriodClosedRow(
      {
        category: 'PROCESS',
        inspectorId: 'inspector-2',
        supplierId: null,
        teamId: 'team-a',
      },
      '2026-06-01',
    );
    expect(process.closedIsIncoming).toBe(false);
  });
});
