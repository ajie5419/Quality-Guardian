import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AfterSalesAPI } from '~/modules/after-sales';
import { DataScopeService } from '~/modules/data-scope/data-scope.service';
import { InspectionService } from '~/modules/inspection/inspection.service';
import { QualityLossDataScopeService } from '~/modules/quality-loss/quality-loss-data-scope.service';
import { QualityLossRecordMaintenanceService } from '~/modules/quality-loss/quality-loss-record-maintenance.service';
import { QualityLossReportingService } from '~/modules/quality-loss/quality-loss-reporting.service';
import { QualityLossRouteUpdateService } from '~/modules/quality-loss/quality-loss-route-update.service';
import { QualityLossSummaryService } from '~/modules/quality-loss/quality-loss-summary.service';
import { QualityLossService } from '~/modules/quality-loss/quality-loss.service';
import { SystemLogService } from '~/modules/system-log/system-log.service';
import { VehicleCommissioningService } from '~/modules/vehicle-commissioning/vehicle-commissioning.service';
import prisma from '~/utils/prisma';

vi.mock('~/utils/prisma', () => ({
  default: {
    quality_loss_index: {
      count: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
      upsert: vi.fn(),
    },
    quality_losses: {
      aggregate: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(async (operations: Promise<unknown>[]) =>
      Promise.all(operations),
    ),
    $queryRaw: vi.fn(),
  },
}));

vi.mock('~/modules/system-log/system-log.service', () => ({
  SystemLogService: {
    auditLog: vi.fn(),
  },
}));

vi.mock('~/modules/data-scope/data-scope.service', () => ({
  DataScopeService: {
    getDeptCandidates: vi.fn(),
    getScopeForModule: vi.fn(),
  },
}));

vi.mock('~/modules/inspection/inspection.service', () => ({
  InspectionService: {
    findIssueIdBySerialNumber: vi.fn(),
    getQualityLossDrillDownRecords: vi.fn(),
    getQualityLossTrendRows: vi.fn(),
    updateQualityLossFields: vi.fn(),
  },
}));

vi.mock('~/modules/after-sales', () => ({
  AfterSalesAPI: {
    findIdBySerialNumber: vi.fn(),
    getQualityLossDrillDownRecords: vi.fn(),
    getQualityLossTrendRows: vi.fn(),
    updateQualityLossFields: vi.fn(),
  },
}));

vi.mock(
  '~/modules/vehicle-commissioning/vehicle-commissioning.service',
  () => ({
    VehicleCommissioningService: {
      findIssueId: vi.fn(),
      getQualityLossDrillDownRecords: vi.fn(),
      getQualityLossTrendRows: vi.fn(),
      updateQualityLossFields: vi.fn(),
    },
  }),
);

vi.mock('~/utils/prisma-error', () => ({
  isPrismaNotFoundError: vi.fn((error: unknown) => {
    return error instanceof Error && error.message === 'not found';
  }),
}));

describe('quality-loss core services', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.$transaction).mockReset();
    vi.mocked(prisma.$transaction).mockImplementation((operations: any) =>
      Promise.all(operations),
    );
  });

  it('builds dashboard summary and yearly charts across month/week/year granularities', () => {
    const list = [
      {
        actualClaim: 20,
        amount: 100,
        date: '2026-01-05',
        responsibleDepartment: 'QA',
        status: 'Pending',
      },
      {
        actualClaim: 50,
        amount: 50,
        date: '2026-02-10',
        responsibleDepartment: 'QA',
        status: 'Confirmed',
      },
      {
        actualClaim: 0,
        amount: 25,
        date: 'bad',
        responsibleDepartment: '',
        status: 'Resolved',
      },
    ] as any[];

    expect(QualityLossSummaryService.getDashboardSummary(list)).toEqual({
      kpi: {
        displayRate: '40%',
        pendingAmount: 105,
        recoveryRate: 40,
        totalAmount: 175,
        totalClaim: 70,
      },
      years: [2026],
    });

    const monthCharts = QualityLossSummaryService.getYearlyCharts(list, {
      granularity: 'month',
      year: 2026,
    } as any);
    expect(monthCharts.deptDistribution[0]).toEqual({ name: 'QA', value: 150 });
    expect(monthCharts.trend[0]).toEqual(
      expect.objectContaining({
        period: 1,
        periodLabel: '1月',
        totalAmount: 100,
      }),
    );

    const yearCharts = QualityLossSummaryService.getYearlyCharts(list, {
      granularity: 'year',
    } as any);
    expect(yearCharts.trend).toEqual([
      expect.objectContaining({ period: 2026, totalAmount: 150 }),
    ]);

    const weekCharts = QualityLossSummaryService.getYearlyCharts(list, {
      granularity: 'week',
      year: 2026,
    } as any);
    expect(weekCharts.trend).toHaveLength(53);
  });

  it('applies data scope and sorts scoped items', async () => {
    const items = [
      { amount: 1, responsibleDepartment: 'QA' },
      { amount: 2, responsibleDepartment: 'ENG' },
    ] as any[];

    await expect(QualityLossDataScopeService.apply(items)).resolves.toEqual(
      items,
    );

    vi.mocked(DataScopeService.getScopeForModule)
      .mockResolvedValueOnce({ scopeType: 'ALL' } as never)
      .mockResolvedValueOnce({ deptIds: ['d1'], scopeType: 'DEPT' } as never);
    await expect(
      QualityLossDataScopeService.apply(items, { userId: 'u-1' }),
    ).resolves.toEqual(items);

    vi.mocked(DataScopeService.getDeptCandidates).mockResolvedValue([
      'QA',
    ] as never);
    await expect(
      QualityLossDataScopeService.sortFilteredByScope(
        items,
        (input) => [...input].sort((a, b) => b.amount - a.amount),
        { userId: 'u-1' },
      ),
    ).resolves.toEqual([{ amount: 1, responsibleDepartment: 'QA' }]);
  });

  it('deletes manual records, batch deletes normalized ids, and returns drill-down data', async () => {
    vi.mocked(prisma.quality_loss_index.findMany).mockResolvedValue([]);
    vi.mocked(prisma.quality_loss_index.updateMany).mockResolvedValue({
      count: 1,
    } as never);
    vi.mocked(prisma.quality_losses.findFirst).mockResolvedValue({
      id: 'ql-1',
    } as never);
    vi.mocked(prisma.quality_losses.updateMany).mockResolvedValue({
      count: 1,
    } as never);
    await QualityLossRecordMaintenanceService.deleteRecord('QL-1', {
      userId: 'u-1',
    });
    expect(prisma.quality_losses.updateMany).toHaveBeenCalledWith({
      where: { id: 'ql-1', isDeleted: false },
      data: { isDeleted: true },
    });
    expect(SystemLogService.auditLog).toHaveBeenCalledWith(
      'quality-loss',
      'delete',
      expect.objectContaining({ targetId: 'ql-1', userId: 'u-1' }),
    );

    vi.mocked(prisma.quality_losses.findFirst).mockResolvedValueOnce(null);
    await expect(
      QualityLossRecordMaintenanceService.deleteRecord('missing', {
        userId: 'u-1',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    vi.mocked(prisma.quality_losses.findMany).mockResolvedValueOnce([
      { id: 'ql-1' },
      { id: 'ql-2' },
    ] as never);
    vi.mocked(prisma.quality_losses.updateMany).mockResolvedValue({
      count: 2,
    } as never);
    await expect(
      QualityLossRecordMaintenanceService.batchDelete(
        ['ql-1', 'ql-2', 'ql-1', ' '],
        { userId: 'u-1' },
      ),
    ).resolves.toEqual({ count: 2 });

    vi.mocked(prisma.quality_loss_index.findMany).mockResolvedValueOnce([
      { id: 'EXT-as-1', source: 'External', amount: 100 },
    ] as never);
    const drillDown = await QualityLossRecordMaintenanceService.getDrillDown(
      new Date('2026-01-01T00:00:00.000Z'),
      new Date('2026-01-31T00:00:00.000Z'),
    );
    expect(drillDown).toEqual([
      { id: 'EXT-as-1', source: 'External', amount: 100 },
    ]);
  });

  it('reports dashboard, weekly tracking, and period metrics', async () => {
    vi.mocked(prisma.quality_losses.aggregate)
      .mockResolvedValueOnce({ _sum: { amount: 100 } } as never)
      .mockResolvedValueOnce({ _sum: { amount: 20 } } as never)
      .mockResolvedValueOnce({ _sum: { amount: 30 } } as never);
    vi.mocked(prisma.quality_losses.findMany).mockResolvedValue([
      { id: 'ql-1' },
    ] as never);

    await expect(
      QualityLossReportingService.getStatsForDashboard({
        weekStart: new Date('2026-01-01T00:00:00.000Z'),
        yearStart: new Date('2026-01-01T00:00:00.000Z'),
      }),
    ).resolves.toEqual({ totalLoss: 100, weeklyLoss: 20 });
    await expect(
      QualityLossReportingService.getWeeklyTrackingIssues({
        closedStatuses: ['Confirmed'],
        end: new Date('2026-01-07T00:00:00.000Z'),
        start: new Date('2026-01-01T00:00:00.000Z'),
      }),
    ).resolves.toEqual([{ id: 'ql-1' }]);
    await expect(
      QualityLossReportingService.getReportPeriodMetrics({
        end: new Date('2026-01-31T00:00:00.000Z'),
        start: new Date('2026-01-01T00:00:00.000Z'),
      }),
    ).resolves.toEqual({ manualLoss: 30 });
  });

  it('updates quality loss route targets for manual and external records and handles failures', async () => {
    vi.mocked(prisma.$transaction).mockImplementation((cb: any) =>
      cb({ quality_losses: { update: vi.fn() } }),
    );
    await expect(
      QualityLossRouteUpdateService.updateByRouteId({
        body: {
          actualClaim: 10,
          amount: 100,
          lossSource: 'Manual',
          status: 'Confirmed',
        },
        id: 'QL-2026-001',
        userId: 'u-1',
      }),
    ).resolves.toEqual({ ok: true });

    vi.mocked(AfterSalesAPI.findIdBySerialNumber).mockResolvedValue(
      'as-1' as never,
    );
    await expect(
      QualityLossRouteUpdateService.updateByRouteId({
        body: {
          actualClaim: 5,
          lossSource: 'External',
          pk: 'EXT-12',
        },
        id: 'EXT-12',
        userId: 'u-1',
      }),
    ).resolves.toEqual({ ok: true });
    expect(AfterSalesAPI.updateQualityLossFields).toHaveBeenCalledWith({
      actualClaim: 5,
      id: 'as-1',
    });

    await expect(
      QualityLossRouteUpdateService.updateByRouteId({
        body: { amount: 'bad', lossSource: 'Manual' },
        id: 'QL-1',
        userId: 'u-1',
      }),
    ).resolves.toEqual(
      expect.objectContaining({ code: 'BAD_REQUEST', ok: false }),
    );

    vi.mocked(prisma.$transaction).mockRejectedValueOnce(
      new Error('not found'),
    );
    await expect(
      QualityLossRouteUpdateService.updateByRouteId({
        body: { amount: 1, lossSource: 'Manual' },
        id: 'QL-404',
        userId: 'u-1',
      }),
    ).resolves.toEqual({
      code: 'NOT_FOUND',
      message: '目标记录不存在',
      ok: false,
    });
  });

  it('facade delegates reporting, route update, delete, batch delete, and drill-down methods', async () => {
    vi.mocked(prisma.quality_losses.aggregate).mockReset();
    vi.mocked(prisma.quality_losses.findMany).mockReset();
    vi.mocked(prisma.quality_losses.aggregate)
      .mockResolvedValueOnce({ _sum: { amount: 100 } } as never)
      .mockResolvedValueOnce({ _sum: { amount: 20 } } as never);
    vi.mocked(prisma.quality_losses.findMany)
      .mockResolvedValueOnce([{ id: 'weekly' }] as never)
      .mockResolvedValueOnce([{ id: 'ql-1' }] as never)
      .mockResolvedValueOnce([{ id: 'manual' }] as never);
    vi.mocked(prisma.quality_losses.findFirst).mockResolvedValue({
      id: 'ql-1',
    } as never);
    vi.mocked(prisma.quality_losses.update).mockResolvedValue({} as never);
    vi.mocked(prisma.quality_losses.updateMany).mockResolvedValue({
      count: 1,
    } as never);
    vi.mocked(
      InspectionService.getQualityLossDrillDownRecords,
    ).mockResolvedValue([] as never);
    vi.mocked(AfterSalesAPI.getQualityLossDrillDownRecords).mockResolvedValue(
      [] as never,
    );
    vi.mocked(
      VehicleCommissioningService.getQualityLossDrillDownRecords,
    ).mockResolvedValue([] as never);
    vi.mocked(prisma.quality_loss_index.findMany).mockResolvedValue([]);
    vi.mocked(prisma.quality_loss_index.updateMany).mockResolvedValue({
      count: 1,
    } as never);

    await expect(
      QualityLossService.getStatsForDashboard({
        weekStart: new Date(),
        yearStart: new Date(),
      }),
    ).resolves.toEqual({ totalLoss: 100, weeklyLoss: 20 });
    await expect(
      QualityLossService.getWeeklyTrackingIssues({
        closedStatuses: ['Confirmed'],
        end: new Date(),
        start: new Date(),
      }),
    ).resolves.toEqual([{ id: 'weekly' }]);
    await QualityLossService.deleteRecord('ql-1', { userId: 'u-1' });
    await expect(
      QualityLossService.batchDelete(['ql-1'], { userId: 'u-1' }),
    ).resolves.toEqual({ count: 1 });
    vi.mocked(prisma.quality_loss_index.findMany).mockResolvedValueOnce([
      { id: 'QL-manual', source: 'Manual', amount: 1 },
    ] as never);
    await expect(
      QualityLossService.getDrillDown(new Date(), new Date()),
    ).resolves.toEqual([{ id: 'QL-manual', source: 'Manual', amount: 1 }]);
  });
});
