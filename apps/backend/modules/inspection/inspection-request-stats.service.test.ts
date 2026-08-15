import { describe, expect, it, vi } from 'vitest';
import { DeptService } from '~/modules/dept';
import prisma from '~/utils/prisma';

import { InspectionRequestStatsService } from './inspection-request-stats.service';

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
    qms_inspection_requests: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
    users: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

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

describe('inspectionRequestStatsService.getRequestStats', () => {
  function setupMocks(requests: ReturnType<typeof makeRequest>[]) {
    vi.mocked(prisma.qms_inspection_requests.findMany).mockResolvedValue(
      requests as any,
    );
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

    const result = await InspectionRequestStatsService.getRequestStats({
      startDate: '2026-06-01',
      endDate: '2026-06-01',
    });

    expect(result.byDepartment).toEqual([
      {
        count: 1,
        department: 'Machining BU',
        responsibleDepartmentId: 'dept-machining',
      },
    ]);
    expect(result.byTeam).toEqual([]);
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

    const result = await InspectionRequestStatsService.getRequestStats({
      startDate: '2026-06-01',
      endDate: '2026-06-01',
    });

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

    const result = await InspectionRequestStatsService.getRequestStats({
      startDate: '2026-06-01',
      endDate: '2026-06-01',
    });

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

    const result = await InspectionRequestStatsService.getRequestStats({
      startDate: '2026-06-01',
      endDate: '2026-06-01',
    });

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
    setupMocks(requests);

    const result = await InspectionRequestStatsService.getRequestStats({
      startDate: '2026-06-01',
      endDate: '2026-06-01',
    });

    expect(result.inspectorStatus).toContainEqual(
      expect.objectContaining({
        activeTaskCount: 1,
        inspector: '张三',
        inspectorId: 'inspector-1',
        status: 'BUSY',
      }),
    );
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

    const result = await InspectionRequestStatsService.getRequestStats({
      startDate: '2026-06-01',
      endDate: '2026-06-01',
    });

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

    const result = await InspectionRequestStatsService.getRequestStats({
      startDate: '2026-06-01',
      endDate: '2026-06-01',
    });

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

    const result = await InspectionRequestStatsService.getRequestStats({
      startDate: '2026-06-01',
      endDate: '2026-06-01',
    });

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

    const result = await InspectionRequestStatsService.getRequestStats({
      startDate: '2026-06-01',
      endDate: '2026-06-01',
    });

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

    const result = await InspectionRequestStatsService.getRequestStats({
      startDate: '2026-06-01',
      endDate: '2026-06-01',
    });

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

    const result = await InspectionRequestStatsService.getRequestStats({
      startDate: '2026-06-01',
      endDate: '2026-06-01',
    });

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

    const result = await InspectionRequestStatsService.getRequestStats({
      startDate: '2026-06-01',
      endDate: '2026-06-01',
    });

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

    const result = await InspectionRequestStatsService.getRequestStats({
      startDate: '2026-06-01',
      endDate: '2026-06-01',
    });

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

    const result = await InspectionRequestStatsService.getRequestStats({
      startDate: '2026-06-01',
      endDate: '2026-06-01',
    });

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

    const result = await InspectionRequestStatsService.getRequestStats({
      startDate: '2026-06-01',
      endDate: '2026-06-01',
    });

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

    const result = await InspectionRequestStatsService.getRequestStats({
      endDate: '2026-06-01',
      startDate: '2026-06-01',
    });

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

    const result = await InspectionRequestStatsService.getRequestStats({
      endDate: '2026-06-01',
      startDate: '2026-06-01',
    });

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

    const result = await InspectionRequestStatsService.getRequestStats({
      endDate: '2026-06-01',
      startDate: '2026-06-01',
    });

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

    const result = await InspectionRequestStatsService.getRequestStats({
      startDate: '2026-06-01',
      endDate: '2026-06-01',
    });

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

    const result = await InspectionRequestStatsService.getRequestStats({
      startDate: '2026-06-01',
      endDate: '2026-06-01',
    });

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

    const result = await InspectionRequestStatsService.getRequestStats({
      startDate: '2026-06-01',
      endDate: '2026-06-01',
    });

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

    const result = await InspectionRequestStatsService.getRequestStats({
      startDate: '2026-06-01',
      endDate: '2026-06-01',
    });

    expect(result.todayClosedIncomingCount).toBe(1);
    expect(result.todayClosedProcessCount).toBe(2);
    expect(result.todayClosedCount).toBe(3);
  });

  it('loads only fields required by the statistics calculation', async () => {
    setupMocks([]);

    await InspectionRequestStatsService.getRequestStats({
      startDate: '2026-06-01',
      endDate: '2026-06-01',
    });

    const [periodQuery, activeInspectorQuery] = vi.mocked(
      prisma.qms_inspection_requests.findMany,
    ).mock.calls;
    expect(periodQuery?.[0]).toHaveProperty('select');
    expect(periodQuery?.[0]).not.toHaveProperty('include');
    expect(activeInspectorQuery?.[0]).toHaveProperty('select');
    expect(activeInspectorQuery?.[0]).not.toHaveProperty('include');
  });
});
