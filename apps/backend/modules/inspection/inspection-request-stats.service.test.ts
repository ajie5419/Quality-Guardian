import type {
  PeriodClosedGroup,
  PeriodSubmittedGroup,
} from './inspection-request-stats-period';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DeptService } from '~/modules/dept';
import prisma from '~/utils/prisma';

import {
  inspectionRequestDurationMinutes as durationMinutes,
  formatInspectionRequestStatsDate as formatShanghaiDate,
} from './inspection-request-stats-date';
import { InspectionRequestStatsService } from './inspection-request-stats.service';

const testAccess = { user: { userId: 'u1', username: 'u1' } };

// All fixtures are queried with startDate/endDate 2026-06-01, which resolves
// to the fixed Shanghai-midnight range below.
const testRange = {
  end: new Date('2026-06-02T00:00:00+08:00'),
  start: new Date('2026-06-01T00:00:00+08:00'),
};

const identityMocks = vi.hoisted(() => ({
  resolveCanonicalIds: vi.fn(),
  resolveSupplierNamesByIds: vi.fn(),
  resolveTeamNamesByIds: vi.fn(),
}));

vi.mock('~/modules/supplier-identity', () => ({
  SupplierIdentityService: {
    resolveNamesByIds: identityMocks.resolveSupplierNamesByIds,
  },
}));

vi.mock('~/modules/team', () => ({
  TeamIdentityService: {
    resolveCanonicalIds: identityMocks.resolveCanonicalIds,
    resolveNamesByIds: identityMocks.resolveTeamNamesByIds,
  },
}));

vi.mock('~/modules/dept', () => ({
  DeptService: { findActiveByIdsOrNames: vi.fn() },
}));

vi.mock('~/utils/prisma', () => ({
  default: {
    $queryRaw: vi.fn().mockResolvedValue([]),
    departments: {
      findMany: vi.fn(),
    },
    qms_inspection_requests: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn(),
    },
    processes: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    users: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

type RequestFixture = ReturnType<typeof makeRequest>;

function makeRequest(overrides: Record<string, unknown> = {}) {
  const now = new Date('2026-06-01T10:00:00+08:00');
  const processName = String(overrides.processName || '过程检验');
  return {
    attachments: null,
    category:
      overrides.category ||
      (processName === '进货检验'
        ? ('INCOMING' as const)
        : ('PROCESS' as const)),
    closedAt: null,
    componentId: null,
    componentName: null,
    dispatchTaskId: null,
    dispatchedAt: null,
    dispatcherId: null,
    id: 'req-1',
    inspectionId: null,
    inspectionResult: 'PASS' as const,
    inspector: null,
    inspectorId: null,
    isDeleted: false,
    linkedIssueId: null,
    linkedIssueNo: null,
    linkedIssueStatus: null,
    partId: null,
    partName: 'part',
    priority: 3,
    processId: null,
    processName,
    responsibilityType: null,
    responsibleDepartmentId: null,
    quantity: 1,
    reporter: 'user1',
    requestNo: 'R001',
    selfCheckResult: 'PASS',
    mutualCheckResult: 'PASS',
    requestInfo: null,
    closeRemark: null,
    closeAttachments: null,
    dispatchRemark: null,
    status: 'SUBMITTED',
    submittedAt: now,
    supplierId: null,
    team: '班组A',
    teamId: 'team-a',
    createdAt: now,
    updatedAt: now,
    workOrderNumber: 'WO1',
    ...overrides,
  };
}

/**
 * Test-side mirror of the DB pre-aggregation (PERF-QMS-001 / PHASE-2A): the
 * submitted GROUP BY uses the same identity/classification dimensions as
 * classifyPeriodSubmittedRow, so the group path must equal the per-row path.
 */
function toSubmittedGroups(requests: RequestFixture[]): PeriodSubmittedGroup[] {
  const groups = new Map<string, PeriodSubmittedGroup>();
  for (const row of requests) {
    if (
      !(row.submittedAt >= testRange.start && row.submittedAt < testRange.end)
    )
      continue;
    if (row.status === 'CANCELLED') continue;
    const group = {
      category: (row.category ?? null) as PeriodSubmittedGroup['category'],
      hasLinkedIssue: Boolean(row.linkedIssueId || row.linkedIssueNo),
      inspectionResult: row.inspectionResult as string,
      processId: (row.processId ?? null) as null | string,
      requestCount: 0,
      responsibilityType: (row.responsibilityType ?? null) as null | string,
      responsibleDepartmentId: (row.responsibleDepartmentId ?? null) as
        | null
        | string,
      status: row.status as string,
      submittedDate: formatShanghaiDate(row.submittedAt),
      supplierId: (row.supplierId ?? null) as null | string,
      teamId: (row.teamId ?? null) as null | string,
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
    const existing = groups.get(key);
    if (existing) existing.requestCount += 1;
    else groups.set(key, { ...group, requestCount: 1 });
  }
  return [...groups.values()];
}

/**
 * Test-side mirror of the DB closed GROUP BY + SUM(duration): keyed by the
 * closed classification dimensions, with totalTaskMinutes = SUM of the
 * per-row floored minute durations.
 */
function toClosedGroups(requests: RequestFixture[]): PeriodClosedGroup[] {
  const groups = new Map<string, PeriodClosedGroup>();
  for (const row of requests) {
    if (!row.closedAt) continue;
    if (!(row.closedAt >= testRange.start && row.closedAt < testRange.end))
      continue;
    if (row.status !== 'CLOSED') continue;
    const inspector = row.inspector as
      | null
      | undefined
      | { realName?: null | string; username?: null | string };
    const group = {
      category: (row.category ?? null) as PeriodClosedGroup['category'],
      closedDate: formatShanghaiDate(row.closedAt),
      inspectorId: (row.inspectorId ?? null) as null | string,
      inspectorRealName: inspector?.realName ?? null,
      inspectorUsername: inspector?.username ?? null,
      requestCount: 0,
      supplierId: (row.supplierId ?? null) as null | string,
      teamId: (row.teamId ?? null) as null | string,
      totalTaskMinutes: 0,
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
    const taskMinutes = durationMinutes(
      row.dispatchedAt || row.submittedAt,
      row.closedAt,
    );
    const existing = groups.get(key);
    if (existing) {
      existing.requestCount += 1;
      existing.totalTaskMinutes += taskMinutes;
    } else {
      groups.set(key, {
        ...group,
        requestCount: 1,
        totalTaskMinutes: taskMinutes,
      });
    }
  }
  return [...groups.values()];
}

describe('inspectionRequestStatsService.getRequestStats', () => {
  function setupMocks(
    requests: RequestFixture[],
    options: { active?: Array<Record<string, unknown>> } = {},
  ) {
    const submittedGroups = toSubmittedGroups(requests);
    const closedGroups = toClosedGroups(requests);
    vi.mocked(prisma.$queryRaw).mockImplementation((async (query: unknown) => {
      const sql = JSON.stringify(query);
      if (sql.includes('activeTaskCount')) return options.active ?? [];
      if (sql.includes('closedDate')) return closedGroups as never;
      return submittedGroups as never;
    }) as never);
    vi.mocked(prisma.qms_inspection_requests.count).mockResolvedValue(0);
    vi.mocked(prisma.users.findMany).mockResolvedValue([]);
    identityMocks.resolveSupplierNamesByIds.mockResolvedValue(
      new Map([
        ['supplier-x', '供应商X'],
        ['supplier-y', '供应商Y'],
      ]),
    );
    identityMocks.resolveTeamNamesByIds.mockResolvedValue(
      new Map([
        ['team-a', '班组A'],
        ['team-b', '班组B'],
      ]),
    );
    identityMocks.resolveCanonicalIds.mockResolvedValue(new Map());
    vi.mocked(prisma.processes.findMany).mockResolvedValue([]);
    vi.mocked(DeptService.findActiveByIdsOrNames).mockResolvedValue([]);
  }

  it('aggregates PROCESS internal requests without TEAM by responsibility department', async () => {
    setupMocks([
      makeRequest({
        id: 'direct-internal',
        responsibilityType: 'INTERNAL_DEPARTMENT',
        responsibleDepartmentId: 'dept-machining',
        team: null,
        teamId: null,
      }),
    ]);
    vi.mocked(DeptService.findActiveByIdsOrNames).mockResolvedValue([
      { businessUnit: null, id: 'dept-machining', name: 'Machining BU' },
    ]);

    const result = await InspectionRequestStatsService.getRequestStats(
      {
        startDate: '2026-06-01',
        endDate: '2026-06-01',
      },
      testAccess,
    );

    expect(result.byDepartment).toEqual([
      {
        count: 1,
        department: 'Machining BU',
        responsibleDepartmentId: 'dept-machining',
      },
    ]);
    expect(result.byTeam).toEqual([
      {
        count: 1,
        team: 'Machining BU',
        teamId: 'dept:dept-machining',
      },
    ]);
    expect(result.historyByDepartment).toEqual(result.byDepartment);
    expect(result.reinspectionRateByDepartment).toEqual([
      expect.objectContaining({
        responsibleDepartmentId: 'dept-machining',
        submittedCount: 1,
      }),
    ]);
  });

  it('excludes incoming inspection records from byTeam', async () => {
    const requests = [
      makeRequest({
        id: 'r1',
        processName: '进货检验',
        supplierId: 'supplier-x',
        team: '供应商X',
      }),
      makeRequest({ id: 'r2', processName: '过程检验', team: '班组A' }),
    ];
    setupMocks(requests);

    const result = await InspectionRequestStatsService.getRequestStats(
      {
        startDate: '2026-06-01',
        endDate: '2026-06-01',
      },
      testAccess,
    );

    expect(result.byTeam).toEqual([
      { count: 1, team: '班组A', teamId: 'team-a' },
    ]);
    expect(result.byTeam.find((t) => t.team === '供应商X')).toBeUndefined();
  });

  it('places incoming inspection records in bySupplier', async () => {
    const requests = [
      makeRequest({
        id: 'r1',
        processName: '进货检验',
        supplierId: 'supplier-x',
        team: '供应商X',
      }),
      makeRequest({
        id: 'r2',
        processName: '进货检验',
        supplierId: 'supplier-x',
        team: '供应商X',
      }),
      makeRequest({ id: 'r3', processName: '过程检验', team: '班组A' }),
    ];
    setupMocks(requests);

    const result = await InspectionRequestStatsService.getRequestStats(
      {
        startDate: '2026-06-01',
        endDate: '2026-06-01',
      },
      testAccess,
    );

    expect(result.bySupplier).toEqual([
      { count: 2, supplierId: 'supplier-x', team: '供应商X' },
    ]);
  });

  it('keeps incoming identity scope after the process display name changes', async () => {
    const requests = [
      makeRequest({
        category: 'INCOMING',
        id: 'r1',
        processName: 'Renamed incoming inspection',
        supplierId: 'supplier-x',
        teamId: null,
      }),
    ];
    setupMocks(requests);

    const result = await InspectionRequestStatsService.getRequestStats(
      {
        startDate: '2026-06-01',
        endDate: '2026-06-01',
      },
      testAccess,
    );

    expect(result.bySupplier).toEqual([
      { count: 1, supplierId: 'supplier-x', team: '供应商X' },
    ]);
    expect(result.byTeam).toEqual([]);
  });

  it('returns inspector id in inspector status rows', async () => {
    const requests = [
      makeRequest({
        id: 'r1',
        inspectorId: 'inspector-1',
        inspector: {
          id: 'inspector-1',
          realName: '张三',
          username: 'zhangsan',
        },
        status: 'DISPATCHED',
      }),
    ];
    setupMocks(requests, {
      active: [
        {
          activeTaskCount: 1,
          earliestStartAt: new Date('2026-06-01T10:00:00+08:00'),
          inspectorId: 'inspector-1',
          inspectorRealName: '张三',
          inspectorUsername: 'zhangsan',
        },
      ],
    });

    const result = await InspectionRequestStatsService.getRequestStats(
      {
        startDate: '2026-06-01',
        endDate: '2026-06-01',
      },
      testAccess,
    );

    expect(result.inspectorStatus).toContainEqual(
      expect.objectContaining({
        activeTaskCount: 1,
        inspector: '张三',
        inspectorId: 'inspector-1',
        status: 'BUSY',
      }),
    );
  });

  it('counts only CLOSED tasks as completed in inspector status', async () => {
    const unclosed = makeRequest({
      id: 'r1',
      inspectorId: 'inspector-1',
      inspector: {
        id: 'inspector-1',
        realName: '张三',
        username: 'zhangsan',
      },
      status: 'DISPATCHED',
      inspectionResult: 'PASS',
    });
    const closed = makeRequest({
      id: 'r2',
      inspectorId: 'inspector-1',
      inspector: {
        id: 'inspector-1',
        realName: '张三',
        username: 'zhangsan',
      },
      closedAt: new Date('2026-06-01T12:00:00+08:00'),
      status: 'CLOSED',
      inspectionResult: 'PASS',
    });
    // The active raw aggregate (status-filtered) only counts the dispatched
    // one; the closed GROUP BY only carries the CLOSED request.
    setupMocks([unclosed, closed], {
      active: [
        {
          activeTaskCount: 1,
          earliestStartAt: new Date('2026-06-01T10:00:00+08:00'),
          inspectorId: 'inspector-1',
          inspectorRealName: '张三',
          inspectorUsername: 'zhangsan',
        },
      ],
    });

    const result = await InspectionRequestStatsService.getRequestStats(
      {
        startDate: '2026-06-01',
        endDate: '2026-06-01',
      },
      testAccess,
    );

    const row = result.inspectorStatus.find(
      (item) => item.inspectorId === 'inspector-1',
    );
    // The unclosed PASS request must not count as completed even though it
    // carries a result, keeping the status card consistent with the ranking.
    expect(row).toMatchObject({
      activeTaskCount: 1,
      completedTaskCount: 1,
      inspectorId: 'inspector-1',
    });
  });

  it('calculates reinspection rate by team for non-incoming only', async () => {
    const requests = [
      makeRequest({
        id: 'r1',
        processName: '过程检验',
        status: 'CLOSED',
        team: '班组A',
        linkedIssueId: 'issue-1',
      }),
      makeRequest({
        id: 'r2',
        processName: '过程检验',
        status: 'CLOSED',
        team: '班组A',
      }),
    ];
    setupMocks(requests);

    const result = await InspectionRequestStatsService.getRequestStats(
      {
        startDate: '2026-06-01',
        endDate: '2026-06-01',
      },
      testAccess,
    );

    expect(result.reinspectionRateByTeam).toHaveLength(1);
    expect(result.reinspectionRateByTeam[0]).toMatchObject({
      reinspectionRate: 50,
      team: '班组A',
      teamId: 'team-a',
    });
  });

  it('calculates reinspection rate by supplier for incoming', async () => {
    const requests = [
      makeRequest({
        id: 'r1',
        processName: '进货检验',
        supplierId: 'supplier-y',
        status: 'CLOSED',
        team: '供应商Y',
        inspectionResult: 'FAIL',
      }),
      makeRequest({
        id: 'r2',
        processName: '进货检验',
        supplierId: 'supplier-y',
        status: 'CLOSED',
        team: '供应商Y',
      }),
    ];
    setupMocks(requests);

    const result = await InspectionRequestStatsService.getRequestStats(
      {
        startDate: '2026-06-01',
        endDate: '2026-06-01',
      },
      testAccess,
    );

    expect(result.reinspectionRateBySupplier).toHaveLength(1);
    expect(result.reinspectionRateBySupplier[0]).toMatchObject({
      reinspectionRate: 50,
      supplierId: 'supplier-y',
      team: '供应商Y',
    });
  });

  it('does not count in-flight FAIL requests in reinspection stats', async () => {
    const requests = [
      makeRequest({
        id: 'r1',
        processName: '过程检验',
        status: 'INSPECTING',
        team: '班组A',
        inspectionResult: 'FAIL',
        linkedIssueId: 'issue-1',
      }),
      makeRequest({
        id: 'r2',
        processName: '过程检验',
        status: 'CLOSED',
        team: '班组A',
        inspectionResult: 'PASS',
      }),
      makeRequest({
        id: 'r3',
        processName: '过程检验',
        status: 'DISPATCHED',
        team: '班组A',
        inspectionResult: 'PASS',
      }),
    ];
    setupMocks(requests);

    const result = await InspectionRequestStatsService.getRequestStats(
      {
        startDate: '2026-06-01',
        endDate: '2026-06-01',
      },
      testAccess,
    );

    // Only the closed request counts as inspected; the in-flight FAIL and
    // the dispatched-but-unclosed PASS requests stay out of both numerator
    // and denominator.
    expect(result.reinspectionRateByTeam).toHaveLength(1);
    expect(result.reinspectionRateByTeam[0]).toMatchObject({
      inspectedCount: 1,
      reinspectionCount: 0,
      reinspectionRate: 0,
      submittedCount: 3,
      team: '班组A',
    });
  });

  it('non-incoming records do not appear in bySupplier', async () => {
    const requests = [
      makeRequest({ id: 'r1', processName: '过程检验', team: '班组A' }),
      makeRequest({ id: 'r2', processName: '装配检验', team: '班组B' }),
    ];
    setupMocks(requests);

    const result = await InspectionRequestStatsService.getRequestStats(
      {
        startDate: '2026-06-01',
        endDate: '2026-06-01',
      },
      testAccess,
    );

    expect(result.bySupplier).toEqual([]);
    expect(result.reinspectionRateBySupplier).toEqual([]);
  });

  it('excludes incoming records from historyByTeam', async () => {
    const requests = [
      makeRequest({
        id: 'r1',
        processName: '进货检验',
        supplierId: 'supplier-x',
        team: '供应商X',
      }),
      makeRequest({ id: 'r2', processName: '过程检验', team: '班组A' }),
    ];
    setupMocks(requests);

    const result = await InspectionRequestStatsService.getRequestStats(
      {
        startDate: '2026-06-01',
        endDate: '2026-06-01',
      },
      testAccess,
    );

    expect(result.historyByTeam).toEqual([
      { count: 1, team: '班组A', teamId: 'team-a' },
    ]);
    expect(
      result.historyByTeam.find((t) => t.team === '供应商X'),
    ).toBeUndefined();
  });

  it('keeps internal-space variants separate when they have different team ids', async () => {
    const requests = [
      makeRequest({ id: 'r1', team: '结构 BU2', teamId: 'team-spaced' }),
      makeRequest({ id: 'r2', team: '结构BU2', teamId: 'team-compact' }),
    ];
    setupMocks(requests);
    identityMocks.resolveTeamNamesByIds.mockResolvedValue(
      new Map([
        ['team-compact', '结构BU2'],
        ['team-spaced', '结构 BU2'],
      ]),
    );

    const result = await InspectionRequestStatsService.getRequestStats(
      {
        startDate: '2026-06-01',
        endDate: '2026-06-01',
      },
      testAccess,
    );

    expect(result.byTeam).toEqual([
      { count: 1, team: '结构 BU2', teamId: 'team-spaced' },
      { count: 1, team: '结构BU2', teamId: 'team-compact' },
    ]);
  });

  it('merges different team snapshots with the same id under its canonical name', async () => {
    const requests = [
      makeRequest({ id: 'r1', team: '结构 BU2', teamId: 'team-structure' }),
      makeRequest({ id: 'r2', team: '结构BU2', teamId: 'team-structure' }),
    ];
    setupMocks(requests);
    identityMocks.resolveTeamNamesByIds.mockResolvedValue(
      new Map([['team-structure', '结构 BU2']]),
    );

    const result = await InspectionRequestStatsService.getRequestStats(
      {
        startDate: '2026-06-01',
        endDate: '2026-06-01',
      },
      testAccess,
    );

    expect(result.byTeam).toEqual([
      { count: 2, team: '结构 BU2', teamId: 'team-structure' },
    ]);
    expect(result.historyByTeam).toEqual(result.byTeam);
    expect(result.reinspectionRateByTeam).toEqual([
      expect.objectContaining({
        submittedCount: 2,
        team: '结构 BU2',
        teamId: 'team-structure',
      }),
    ]);
  });

  it('does not merge different team ids that share the same canonical name', async () => {
    const requests = [
      makeRequest({ id: 'r1', teamId: 'team-1' }),
      makeRequest({ id: 'r2', teamId: 'team-2' }),
    ];
    setupMocks(requests);
    identityMocks.resolveTeamNamesByIds.mockResolvedValue(
      new Map([
        ['team-1', '装配 BU'],
        ['team-2', '装配 BU'],
      ]),
    );

    const result = await InspectionRequestStatsService.getRequestStats(
      {
        startDate: '2026-06-01',
        endDate: '2026-06-01',
      },
      testAccess,
    );

    expect(result.byTeam).toEqual([
      { count: 1, team: '装配 BU', teamId: 'team-1' },
      { count: 1, team: '装配 BU', teamId: 'team-2' },
    ]);
  });

  it('aggregates legacy merged team ids under the canonical team', async () => {
    const requests = [
      makeRequest({ id: 'r1', team: '结构 BU2', teamId: 'team-a' }),
      makeRequest({ id: 'r2', team: '结构BU2', teamId: 'team-legacy' }),
    ];
    setupMocks(requests);
    identityMocks.resolveTeamNamesByIds.mockResolvedValue(
      new Map([
        ['team-a', '结构 BU2'],
        ['team-legacy', '结构BU2'],
      ]),
    );
    identityMocks.resolveCanonicalIds.mockResolvedValue(
      new Map([['team-legacy', 'team-a']]),
    );

    const result = await InspectionRequestStatsService.getRequestStats(
      {
        startDate: '2026-06-01',
        endDate: '2026-06-01',
      },
      testAccess,
    );

    expect(result.byTeam).toEqual([
      { count: 2, team: '结构 BU2', teamId: 'team-a' },
    ]);
    expect(result.historyByTeam).toEqual(result.byTeam);
    expect(result.reinspectionRateByTeam).toEqual([
      expect.objectContaining({
        submittedCount: 2,
        team: '结构 BU2',
        teamId: 'team-a',
      }),
    ]);
  });

  it('uses the responsibility department domain when PROCESS requests have no TEAM', async () => {
    const requests = [
      makeRequest({ id: 'r1', team: '结构 BU2', teamId: null }),
      makeRequest({ id: 'r2', team: '结构BU2', teamId: null }),
    ];
    setupMocks(requests);

    const result = await InspectionRequestStatsService.getRequestStats(
      {
        startDate: '2026-06-01',
        endDate: '2026-06-01',
      },
      testAccess,
    );

    expect(result.byTeam).toEqual([]);
    expect(result.byDepartment).toEqual([
      {
        count: 2,
        department: 'Unresolved department',
        responsibleDepartmentId: null,
      },
    ]);
    expect(identityMocks.resolveTeamNamesByIds).toHaveBeenCalledWith([]);
  });

  it('keeps unresolved non-empty TEAM ids distinguishable', async () => {
    const requests = [
      makeRequest({ id: 'r1', teamId: 'team-missing-1' }),
      makeRequest({ id: 'r2', teamId: 'team-missing-2' }),
    ];
    setupMocks(requests);
    identityMocks.resolveTeamNamesByIds.mockResolvedValue(new Map());

    const result = await InspectionRequestStatsService.getRequestStats(
      {
        endDate: '2026-06-01',
        startDate: '2026-06-01',
      },
      testAccess,
    );

    expect(result.byTeam).toEqual([
      {
        count: 1,
        team: 'Unresolved team (team-missing-1)',
        teamId: 'team-missing-1',
      },
      {
        count: 1,
        team: 'Unresolved team (team-missing-2)',
        teamId: 'team-missing-2',
      },
    ]);
  });

  it('groups incoming requests without supplier ids in one unresolved bucket', async () => {
    const requests = [
      makeRequest({ category: 'INCOMING', id: 'r1', supplierId: null }),
      makeRequest({ category: 'INCOMING', id: 'r2', supplierId: null }),
    ];
    setupMocks(requests);

    const result = await InspectionRequestStatsService.getRequestStats(
      {
        endDate: '2026-06-01',
        startDate: '2026-06-01',
      },
      testAccess,
    );

    expect(result.bySupplier).toEqual([
      { count: 2, supplierId: null, team: 'Unresolved supplier' },
    ]);
  });

  it('keeps a legacy supplier-linked TEAM request in the process domain', async () => {
    const requests = [
      makeRequest({
        category: null,
        id: 'r1',
        supplierId: 'supplier-x',
        teamId: 'team-a',
      }),
    ];
    setupMocks(requests);

    const result = await InspectionRequestStatsService.getRequestStats(
      {
        endDate: '2026-06-01',
        startDate: '2026-06-01',
      },
      testAccess,
    );

    expect(result.byTeam).toEqual([
      { count: 1, team: '班组A', teamId: 'team-a' },
    ]);
    expect(result.bySupplier).toEqual([]);
  });

  it('groups suppliers by supplier id and uses canonical names', async () => {
    const requests = [
      makeRequest({
        id: 'r1',
        processName: '进货检验',
        supplierId: 'supplier-1',
        team: 'Legacy supplier name',
      }),
      makeRequest({
        id: 'r2',
        processName: '进货检验',
        supplierId: 'supplier-1',
        team: 'Different snapshot',
      }),
    ];
    setupMocks(requests);
    identityMocks.resolveSupplierNamesByIds.mockResolvedValue(
      new Map([['supplier-1', 'Canonical supplier']]),
    );

    const result = await InspectionRequestStatsService.getRequestStats(
      {
        startDate: '2026-06-01',
        endDate: '2026-06-01',
      },
      testAccess,
    );

    expect(result.bySupplier).toEqual([
      {
        count: 2,
        supplierId: 'supplier-1',
        team: 'Canonical supplier',
      },
    ]);
    expect(result.reinspectionRateBySupplier[0]).toMatchObject({
      supplierId: 'supplier-1',
      team: 'Canonical supplier',
    });
  });

  it('keeps inspectors with the same name separate by inspector id', async () => {
    const closedAt = new Date('2026-06-01T14:00:00+08:00');
    const requests = [
      makeRequest({
        closedAt,
        id: 'r1',
        inspector: { id: 'inspector-1', realName: '张三', username: 'one' },
        inspectorId: 'inspector-1',
        status: 'CLOSED',
      }),
      makeRequest({
        closedAt,
        id: 'r2',
        inspector: { id: 'inspector-2', realName: '张三', username: 'two' },
        inspectorId: 'inspector-2',
        status: 'CLOSED',
      }),
    ];
    setupMocks(requests);

    const result = await InspectionRequestStatsService.getRequestStats(
      {
        startDate: '2026-06-01',
        endDate: '2026-06-01',
      },
      testAccess,
    );

    expect(result.byInspector).toEqual([
      { count: 1, inspector: '张三', inspectorId: 'inspector-1' },
      { count: 1, inspector: '张三', inspectorId: 'inspector-2' },
    ]);
    expect(result.historyByInspector).toEqual([
      expect.objectContaining({
        inspector: '张三',
        inspectorId: 'inspector-1',
      }),
      expect.objectContaining({
        inspector: '张三',
        inspectorId: 'inspector-2',
      }),
    ]);
  });

  it('returns category counts for submitted requests', async () => {
    const requests = [
      makeRequest({ id: 'r1', processName: '进货检验', team: '供应商X' }),
      makeRequest({ id: 'r2', processName: '进货检验', team: '供应商Y' }),
      makeRequest({ id: 'r3', processName: '过程检验', team: '班组A' }),
      makeRequest({ id: 'r4', processName: '装配检验', team: '班组B' }),
    ];
    setupMocks(requests);

    const result = await InspectionRequestStatsService.getRequestStats(
      {
        startDate: '2026-06-01',
        endDate: '2026-06-01',
      },
      testAccess,
    );

    expect(result.todaySubmittedIncomingCount).toBe(2);
    expect(result.todaySubmittedProcessCount).toBe(2);
    expect(result.todaySubmittedCount).toBe(4);
  });

  it('returns category counts for closed requests', async () => {
    const closedAt = new Date('2026-06-01T14:00:00+08:00');
    const requests = [
      makeRequest({
        id: 'r1',
        processName: '进货检验',
        team: '供应商X',
        status: 'CLOSED',
        closedAt,
      }),
      makeRequest({
        id: 'r2',
        processName: '过程检验',
        team: '班组A',
        status: 'CLOSED',
        closedAt,
      }),
      makeRequest({
        id: 'r3',
        processName: '过程检验',
        team: '班组B',
        status: 'CLOSED',
        closedAt,
      }),
    ];
    setupMocks(requests);

    const result = await InspectionRequestStatsService.getRequestStats(
      {
        startDate: '2026-06-01',
        endDate: '2026-06-01',
      },
      testAccess,
    );

    expect(result.todayClosedIncomingCount).toBe(1);
    expect(result.todayClosedProcessCount).toBe(2);
    expect(result.todayClosedCount).toBe(3);
  });

  it('includes internal requests without a TEAM under the department-named team row', async () => {
    const request = makeRequest({
      id: 'dept-fallback-team',
      processId: 'proc-machining',
      responsibilityType: 'INTERNAL_DEPARTMENT',
      responsibleDepartmentId: 'dept-machining',
      team: null,
      teamId: null,
      status: 'CLOSED',
      closedAt: new Date('2026-06-01T11:00:00+08:00'),
    });
    setupMocks([request]);
    vi.mocked(DeptService.findActiveByIdsOrNames).mockResolvedValue([
      { businessUnit: null, id: 'dept-machining', name: 'Machining BU' },
    ]);

    const result = await InspectionRequestStatsService.getRequestStats(
      {
        startDate: '2026-06-01',
        endDate: '2026-06-01',
      },
      testAccess,
    );

    expect(result.byTeam).toEqual([
      {
        count: 1,
        team: 'Machining BU',
        teamId: 'dept:dept-machining',
      },
    ]);
    expect(result.historyByTeam).toEqual(result.byTeam);
    expect(result.reinspectionRateByTeam).toEqual([
      expect.objectContaining({
        submittedCount: 1,
        team: 'Machining BU',
      }),
    ]);
  });

  it('merges a department-fallback team row into the unique same-name real team row', async () => {
    const requests = [
      makeRequest({
        id: 'real-team',
        teamId: 'team-a',
        team: '班组A',
        responsibilityType: 'INTERNAL_DEPARTMENT',
        responsibleDepartmentId: 'dept-a',
      }),
      makeRequest({
        id: 'dept-only',
        teamId: null,
        team: null,
        responsibilityType: 'INTERNAL_DEPARTMENT',
        responsibleDepartmentId: 'dept-a',
      }),
    ];
    setupMocks(requests);
    identityMocks.resolveTeamNamesByIds.mockResolvedValue(
      new Map([['team-a', '班组A']]),
    );
    vi.mocked(DeptService.findActiveByIdsOrNames).mockResolvedValue([
      { businessUnit: null, id: 'dept-a', name: '班组A' },
    ]);

    const result = await InspectionRequestStatsService.getRequestStats(
      {
        startDate: '2026-06-01',
        endDate: '2026-06-01',
      },
      testAccess,
    );

    expect(result.byTeam).toEqual([
      {
        count: 2,
        team: '班组A',
        teamId: 'team-a',
      },
    ]);
  });

  it('falls back to the process master department when a request has no responsibility department snapshot', async () => {
    const request = makeRequest({
      id: 'process-fallback',
      processId: 'proc-machining',
      responsibleDepartmentId: null,
      responsibilityType: 'INTERNAL_DEPARTMENT',
      team: null,
      teamId: null,
      status: 'CLOSED',
      closedAt: new Date('2026-06-01T11:00:00+08:00'),
    });
    setupMocks([request]);
    vi.mocked(prisma.processes.findMany).mockResolvedValue([
      { id: 'proc-machining', responsibleDepartmentId: 'dept-machining' },
    ] as any);
    vi.mocked(DeptService.findActiveByIdsOrNames).mockResolvedValue([
      { businessUnit: null, id: 'dept-machining', name: 'Machining BU' },
    ]);

    const result = await InspectionRequestStatsService.getRequestStats(
      {
        startDate: '2026-06-01',
        endDate: '2026-06-01',
      },
      testAccess,
    );

    expect(result.byDepartment).toEqual([
      {
        count: 1,
        department: 'Machining BU',
        responsibleDepartmentId: 'dept-machining',
      },
    ]);
    expect(result.historyByDepartment).toEqual(result.byDepartment);
    expect(result.reinspectionRateByDepartment).toEqual([
      expect.objectContaining({
        responsibleDepartmentId: 'dept-machining',
        submittedCount: 1,
      }),
    ]);
  });

  it('keeps requests unresolved when neither the snapshot nor the process master has a department', async () => {
    const request = makeRequest({
      id: 'no-dept-anywhere',
      processId: 'proc-unconfigured',
      responsibleDepartmentId: null,
      responsibilityType: 'INTERNAL_DEPARTMENT',
      team: null,
      teamId: null,
    });
    setupMocks([request]);
    vi.mocked(prisma.processes.findMany).mockResolvedValue([
      { id: 'proc-unconfigured', responsibleDepartmentId: null },
    ] as any);

    const result = await InspectionRequestStatsService.getRequestStats(
      {
        startDate: '2026-06-01',
        endDate: '2026-06-01',
      },
      testAccess,
    );

    expect(result.byDepartment).toEqual([
      expect.objectContaining({
        responsibleDepartmentId: null,
        count: 1,
      }),
    ]);
  });

  it('never loads full period rows: period stats are DB pre-aggregated', async () => {
    setupMocks([]);

    await InspectionRequestStatsService.getRequestStats(
      {
        startDate: '2026-06-01',
        endDate: '2026-06-01',
      },
      testAccess,
    );

    expect(prisma.qms_inspection_requests.findMany).not.toHaveBeenCalled();
    const rawSql = vi
      .mocked(prisma.$queryRaw)
      .mock.calls.map((call) => JSON.stringify(call))
      .join(' ');
    expect(rawSql).toContain('GROUP BY');
    // Every raw aggregate query embeds the request-domain scope fragment.
    expect(rawSql).toContain('request_row');
  });

  describe('data scope (SEC-INSPECTION-REQUEST-ANALYTICS-001)', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    const deptAAccess = {
      dataScope: {
        deptIds: ['dept-a'],
        module: 'inspection',
        scopeType: 'DEPT' as const,
      },
      user: { userId: 'u-dept-a', username: 'user-a' },
    };
    const selfAccess = {
      dataScope: {
        deptIds: [],
        module: 'inspection',
        scopeType: 'SELF' as const,
      },
      user: { userId: 'u-self', username: 'self-a' },
    };
    const allAccess = {
      dataScope: {
        deptIds: [],
        module: 'inspection',
        scopeType: 'ALL' as const,
      },
      user: { userId: 'u-all', username: 'admin' },
    };

    it('applies the department filter to every request query for DEPT scope', async () => {
      setupMocks([
        makeRequest({
          id: 'req-a',
          responsibleDepartment: 'Dept A',
          responsibleDepartmentId: 'dept-a',
        }),
      ]);
      vi.mocked(prisma.departments.findMany).mockResolvedValue([
        { name: 'Dept A' },
      ] as any);
      vi.mocked(DeptService.findActiveByIdsOrNames).mockResolvedValue([
        { businessUnit: null, id: 'dept-a', name: 'Dept A' },
      ]);

      const result = await InspectionRequestStatsService.getRequestStats(
        {
          startDate: '2026-06-01',
          endDate: '2026-06-01',
        },
        deptAAccess,
      );

      const countCalls = vi.mocked(prisma.qms_inspection_requests.count).mock
        .calls;
      const deptFilter = {
        responsibleDepartment: { in: ['dept-a', 'Dept A'] },
      };
      for (const call of countCalls) {
        expect(call[0].where.AND[1]).toEqual(deptFilter);
      }
      const rawSql = vi
        .mocked(prisma.$queryRaw)
        .mock.calls.map((call) => JSON.stringify(call))
        .join(' ');
      expect(rawSql).toContain('request_row.responsibleDepartment IN');
      // Only the scoped rows reach the JS aggregation; B rows never appear.
      expect(result.todaySubmittedCount).toBe(1);
      expect(result.byDepartment).toEqual([
        expect.objectContaining({
          count: 1,
          department: 'Dept A',
          responsibleDepartmentId: 'dept-a',
        }),
      ]);
    });

    it('scopes by inspector/reporter ownership for SELF scope', async () => {
      setupMocks([
        makeRequest({
          id: 'mine',
          inspectorId: 'u-self',
          status: 'CLOSED',
          submittedAt: new Date('2026-06-01T09:00:00+08:00'),
          closedAt: new Date('2026-06-01T11:00:00+08:00'),
        }),
      ]);

      await InspectionRequestStatsService.getRequestStats(
        {
          startDate: '2026-06-01',
          endDate: '2026-06-01',
        },
        selfAccess,
      );

      const countCalls = vi.mocked(prisma.qms_inspection_requests.count).mock
        .calls;
      for (const call of countCalls) {
        expect(call[0].where.AND[1]).toEqual({
          OR: [{ inspectorId: 'u-self' }, { reporterId: 'u-self' }],
        });
      }
      const rawSql = vi
        .mocked(prisma.$queryRaw)
        .mock.calls.map((call) => JSON.stringify(call))
        .join(' ');
      expect(rawSql).toContain('request_row.inspectorId =');
      expect(rawSql).toContain('request_row.reporterId =');
    });

    it('keeps the base where unchanged for ALL scope', async () => {
      setupMocks([makeRequest({ id: 'req-a' }), makeRequest({ id: 'req-b' })]);

      const result = await InspectionRequestStatsService.getRequestStats(
        {
          startDate: '2026-06-01',
          endDate: '2026-06-01',
        },
        allAccess,
      );

      const countCalls = vi.mocked(prisma.qms_inspection_requests.count).mock
        .calls;
      for (const call of countCalls) {
        expect(call[0].where.AND).toBeUndefined();
        expect(call[0].where.isDeleted).toBe(false);
      }
      const rawSql = vi
        .mocked(prisma.$queryRaw)
        .mock.calls.map((call) => JSON.stringify(call))
        .join(' ');
      expect(rawSql).not.toContain('request_row.responsibleDepartment IN');
      expect(rawSql).not.toContain('request_row.inspectorId =');
      // A + B rows both count under ALL.
      expect(result.todaySubmittedCount).toBe(2);
    });

    it('fails closed when the access context is missing a user', async () => {
      setupMocks([]);

      await expect(
        InspectionRequestStatsService.getRequestStats(
          {
            startDate: '2026-06-01',
            endDate: '2026-06-01',
          },
          {} as any,
        ),
      ).rejects.toThrow('Analytics access context is missing a user');
      await expect(
        InspectionRequestStatsService.getRequestStats(
          {
            startDate: '2026-06-01',
            endDate: '2026-06-01',
          },
          undefined as any,
        ),
      ).rejects.toThrow('Analytics access context is missing a user');
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('fails closed to an empty set when no department candidate resolves', async () => {
      setupMocks([]);
      vi.mocked(prisma.departments.findMany).mockResolvedValue([]);

      await InspectionRequestStatsService.getRequestStats(
        {
          startDate: '2026-06-01',
          endDate: '2026-06-01',
        },
        {
          dataScope: {
            deptIds: [],
            module: 'inspection',
            scopeType: 'DEPT' as const,
          },
          user: { userId: 'u-dept-a', username: 'user-a' },
        },
      );

      const countCalls = vi.mocked(prisma.qms_inspection_requests.count).mock
        .calls;
      for (const call of countCalls) {
        expect(call[0].where.AND[1]).toEqual({ id: '__none__' });
      }
      const rawSql = vi
        .mocked(prisma.$queryRaw)
        .mock.calls.map((call) => JSON.stringify(call))
        .join(' ');
      expect(rawSql).toContain('AND 1 = 0');
    });
  });
});
