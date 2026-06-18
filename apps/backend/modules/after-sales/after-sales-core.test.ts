import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AfterSalesAnalyticsService } from '~/modules/after-sales/after-sales-analytics.service';
import { AfterSalesChartAggregationService } from '~/modules/after-sales/after-sales-chart-aggregation.service';
import { getNextAfterSalesSerialNumber } from '~/modules/after-sales/after-sales-id';
import {
  isAfterSalesClaimStatus,
  normalizeAfterSalesClaimStatus,
} from '~/modules/after-sales/after-sales-status';
import { AfterSalesService } from '~/modules/after-sales/after-sales.service';
import { DataScopeService } from '~/modules/data-scope/data-scope.service';
import { DeptService } from '~/modules/dept/dept.service';
import { FileStorageService } from '~/modules/file-storage/file-storage.service';
import { SystemLogService } from '~/modules/system-log/system-log.service';
import prisma from '~/utils/prisma';

vi.mock('~/utils/prisma', () => ({
  default: {
    after_sales: {
      aggregate: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      groupBy: vi.fn(),
      update: vi.fn(),
    },
    $queryRaw: vi.fn(),
  },
}));

vi.mock('~/modules/data-scope/data-scope.service', () => ({
  DataScopeService: {
    buildAfterSalesWhere: vi.fn(async (where) => ({
      ...where,
      scoped: true,
    })),
  },
}));

vi.mock('~/modules/file-storage/file-storage.service', () => ({
  FileStorageService: {
    softDeleteReferences: vi.fn(),
  },
}));

vi.mock('~/modules/system-log/system-log.service', () => ({
  SystemLogService: {
    auditLog: vi.fn(),
  },
}));

vi.mock('~/modules/dept/dept.service', () => ({
  DeptService: {
    findAll: vi.fn(),
  },
}));

vi.mock(
  '~/modules/after-sales/after-sales-payload',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('~/modules/after-sales/after-sales-payload')
    >()),
    buildGovernedAfterSalesUpdateData: vi.fn(
      async (body: Record<string, unknown>) => ({
        costsChanged: Boolean(body.materialCost || body.laborTravelCost),
        data: body,
      }),
    ),
  }),
);

describe('after-sales core helpers and services', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('normalizes claim statuses and computes next serial number', async () => {
    expect(isAfterSalesClaimStatus('OPEN')).toBe(true);
    expect(isAfterSalesClaimStatus('UNKNOWN')).toBe(false);
    expect(normalizeAfterSalesClaimStatus(' completed ')).toBe('COMPLETED');
    expect(normalizeAfterSalesClaimStatus('bad')).toBeUndefined();

    vi.mocked(prisma.after_sales.aggregate).mockResolvedValue({
      _max: { serialNumber: 41 },
    } as never);
    await expect(getNextAfterSalesSerialNumber()).resolves.toBe(42);
  });

  it('delegates facade integration and analytics methods', async () => {
    vi.mocked(prisma.after_sales.findFirst).mockResolvedValue({
      id: 'as-1',
    } as never);
    vi.mocked(prisma.after_sales.update).mockResolvedValue({} as never);
    vi.mocked(prisma.after_sales.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.after_sales.count).mockResolvedValue(3 as never);
    vi.mocked(prisma.after_sales.aggregate).mockResolvedValue({
      _count: { id: 1 },
      _sum: { laborTravelCost: 2, materialCost: 3 },
    } as never);
    (prisma.after_sales.groupBy as any).mockResolvedValue([]);
    vi.mocked(prisma.$queryRaw).mockResolvedValue([] as never);

    await expect(AfterSalesService.findIdBySerialNumber(1)).resolves.toBe(
      'as-1',
    );
    await AfterSalesService.updateQualityLossFields({
      actualClaim: 10,
      id: 'as-1',
    });
    await AfterSalesService.getQualityLossTrendRows({
      granularity: 'month',
      year: 2026,
    });
    await AfterSalesService.getLossRecordsForAggregation({
      skip: 1,
      take: 2,
      workOrderNumber: 'WO',
    });
    await expect(
      AfterSalesService.countLossRecordsForAggregation({
        workOrderNumber: 'WO',
      }),
    ).resolves.toBe(3);
    await AfterSalesService.getQualityLossDrillDownRecords({
      end: new Date('2026-01-31T00:00:00.000Z'),
      start: new Date('2026-01-01T00:00:00.000Z'),
      take: 5,
    });
    await AfterSalesService.getSupplierScoringData({
      since: new Date('2026-01-01T00:00:00.000Z'),
      supplierNames: ['Supplier A'],
    });
    await AfterSalesService.getWeeklyReportIssues({
      end: new Date('2026-01-07T00:00:00.000Z'),
      start: new Date('2026-01-01T00:00:00.000Z'),
    });
    await AfterSalesService.getVehicleFailureRecords({
      end: new Date('2026-01-31T00:00:00.000Z'),
      productType: 'Vehicle',
      start: new Date('2026-01-01T00:00:00.000Z'),
      vehicleDeptIds: ['dept-1'],
    });
    await AfterSalesService.findEarliestVehicleFailureDate({
      end: new Date('2026-01-31T00:00:00.000Z'),
      productType: 'Vehicle',
      vehicleDeptIds: [],
    });
    await AfterSalesService.getReportPeriodMetrics({
      end: new Date('2026-01-31T00:00:00.000Z'),
      start: new Date('2026-01-01T00:00:00.000Z'),
    });
    await AfterSalesService.getStatsForDashboard({
      weekStart: new Date('2026-01-01T00:00:00.000Z'),
      yearStart: new Date('2026-01-01T00:00:00.000Z'),
    });

    expect(prisma.after_sales.update).toHaveBeenCalledWith({
      where: { id: 'as-1' },
      data: expect.objectContaining({
        actualClaim: 10,
        updatedAt: expect.any(Date),
      }),
    });
    expect(prisma.after_sales.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workOrderNumber: { contains: 'WO' },
        }),
      }),
    );
  });

  it('updates route fields with quality loss recalculation only when costs change', async () => {
    vi.mocked(prisma.after_sales.findUnique).mockResolvedValue({
      laborTravelCost: 20,
      materialCost: 30,
    } as never);
    vi.mocked(prisma.after_sales.update).mockResolvedValue({} as never);

    await AfterSalesService.updateByRoute('as-1', {
      materialCost: 100,
    });
    await AfterSalesService.updateByRoute('as-2', {
      projectName: 'Project',
    });

    expect(prisma.after_sales.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'as-1' },
      data: expect.objectContaining({
        materialCost: 100,
        qualityLoss: 120,
      }),
    });
    expect(prisma.after_sales.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.after_sales.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'as-2' },
      data: { projectName: 'Project' },
    });
  });

  it('throws not-found when updating route costs for missing record and deletes records with references/audit', async () => {
    vi.mocked(prisma.after_sales.findUnique).mockResolvedValue(null);
    await expect(
      AfterSalesService.updateByRoute('as-404', { laborTravelCost: 10 }),
    ).rejects.toThrow('AFTER_SALES_NOT_FOUND');

    vi.mocked(prisma.after_sales.update).mockResolvedValue({} as never);
    await AfterSalesService.deleteRecord('as-1', 'user-1');

    expect(prisma.after_sales.update).toHaveBeenCalledWith({
      where: { id: 'as-1' },
      data: {
        isDeleted: true,
        updatedAt: expect.any(Date),
      },
    });
    expect(FileStorageService.softDeleteReferences).toHaveBeenCalledWith({
      bizId: 'as-1',
      bizType: 'after_sales',
    });
    expect(SystemLogService.auditLog).toHaveBeenCalledWith(
      'after-sales',
      'delete',
      expect.objectContaining({ targetId: 'as-1', userId: 'user-1' }),
    );
  });

  it('builds chart aggregation from grouped rows, department names, report months, and scoped queries', async () => {
    (prisma.after_sales.groupBy as any).mockResolvedValue([
      {
        respDept: 'dept-1',
        _sum: { materialCost: 100, laborTravelCost: 25 },
      },
      {
        respDept: 'dept-2',
        _sum: { materialCost: 20, laborTravelCost: 5 },
      },
    ] as never);
    vi.mocked(DeptService.findAll).mockResolvedValue([
      { id: 'dept-1', name: 'Quality', children: [] },
      { id: 'dept-2', name: 'Service', children: [] },
    ] as never);

    const grouped = await AfterSalesChartAggregationService.getChartAggregation(
      {
        dimension: 'responsibleDept',
        metric: 'totalLoss',
        top: 1,
        userContext: { userId: 'u-1', username: 'admin' },
        year: 2026,
      },
    );

    expect(grouped).toEqual([{ name: 'Quality', value: 125 }]);
    expect(DataScopeService.buildAfterSalesWhere).toHaveBeenCalled();

    vi.mocked(prisma.after_sales.findMany).mockResolvedValue([
      {
        occurDate: new Date('2026-01-01T00:00:00.000Z'),
        laborTravelCost: 20,
        materialCost: 80,
        quantity: 2,
        runningHours: 10,
      },
      {
        occurDate: new Date('2026-01-20T00:00:00.000Z'),
        laborTravelCost: 5,
        materialCost: 15,
        quantity: 1,
        runningHours: 4,
      },
    ] as never);

    await expect(
      AfterSalesChartAggregationService.getChartAggregation({
        dimension: 'reportMonth',
        metric: 'totalLoss',
        year: 2026,
      }),
    ).resolves.toEqual([{ name: '2026-01', value: 120 }]);
  });

  it('returns empty stats response when analytics query fails', async () => {
    vi.mocked(prisma.after_sales.aggregate).mockRejectedValue(
      new Error('db unavailable') as never,
    );

    const stats = await AfterSalesAnalyticsService.getStats({ year: 2026 });

    expect(stats.kpi).toEqual({ avgTime: 0, cost: 0, open: 0, total: 0 });
    expect(stats.defectDistribution).toEqual([]);
  });
});
