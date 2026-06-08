import { describe, expect, it, vi } from 'vitest';
import prisma from '~/utils/prisma';

import { InspectionRequestStatsService } from './inspection-request-stats.service';

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
  return {
    attachments: null,
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
    processName: '过程检验',
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
    team: '班组A',
    teamId: null,
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
  }

  it('excludes incoming inspection records from byTeam', async () => {
    const requests = [
      makeRequest({ id: 'r1', processName: '进货检验', team: '供应商X' }),
      makeRequest({ id: 'r2', processName: '过程检验', team: '班组A' }),
    ];
    setupMocks(requests);

    const result = await InspectionRequestStatsService.getRequestStats({
      startDate: '2026-06-01',
      endDate: '2026-06-01',
    });

    expect(result.byTeam).toEqual([{ count: 1, team: '班组A' }]);
    expect(result.byTeam.find((t) => t.team === '供应商X')).toBeUndefined();
  });

  it('places incoming inspection records in bySupplier', async () => {
    const requests = [
      makeRequest({ id: 'r1', processName: '进货检验', team: '供应商X' }),
      makeRequest({ id: 'r2', processName: '进货检验', team: '供应商X' }),
      makeRequest({ id: 'r3', processName: '过程检验', team: '班组A' }),
    ];
    setupMocks(requests);

    const result = await InspectionRequestStatsService.getRequestStats({
      startDate: '2026-06-01',
      endDate: '2026-06-01',
    });

    expect(result.bySupplier).toEqual([{ count: 2, team: '供应商X' }]);
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
    });
  });

  it('calculates reinspection rate by supplier for incoming', async () => {
    const requests = [
      makeRequest({
        id: 'r1',
        processName: '进货检验',
        status: 'CLOSED',
        team: '供应商Y',
        inspectionResult: 'FAIL',
      }),
      makeRequest({
        id: 'r2',
        processName: '进货检验',
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
      team: '供应商Y',
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
      makeRequest({ id: 'r1', processName: '进货检验', team: '供应商X' }),
      makeRequest({ id: 'r2', processName: '过程检验', team: '班组A' }),
    ];
    setupMocks(requests);

    const result = await InspectionRequestStatsService.getRequestStats({
      startDate: '2026-06-01',
      endDate: '2026-06-01',
    });

    expect(result.historyByTeam).toEqual([{ count: 1, team: '班组A' }]);
    expect(
      result.historyByTeam.find((t) => t.team === '供应商X'),
    ).toBeUndefined();
  });
});
