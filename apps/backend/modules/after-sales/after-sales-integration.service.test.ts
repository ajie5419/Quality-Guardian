import { beforeEach, describe, expect, it, vi } from 'vitest';
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

vi.mock('~/modules/quality-loss/quality-loss-status', () => ({
  toAfterSalesClaimStatus: vi.fn((status: string) => {
    const map: Record<string, string> = {
      confirmed: 'CONFIRMED',
      pending: 'PENDING',
      resolved: 'RESOLVED',
    };
    return map[status?.toLowerCase()] || status?.toUpperCase() || 'PENDING';
  }),
}));

describe('after-sales-integration.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.after_sales.findUnique as any).mockResolvedValue(null);
  });

  it('should find id by serial number', async () => {
    const { AfterSalesIntegrationService } = await import(
      '~/modules/after-sales/after-sales-integration.service'
    );
    const prismaModule = await import('~/utils/prisma');
    const prisma = prismaModule.default;

    (prisma.after_sales.findFirst as any).mockResolvedValue({ id: 'as-1' });

    const result = await AfterSalesIntegrationService.findIdBySerialNumber(42);
    expect(result).toBe('as-1');
  });

  it('should return null when serial number not found', async () => {
    const { AfterSalesIntegrationService } = await import(
      '~/modules/after-sales/after-sales-integration.service'
    );
    const prismaModule = await import('~/utils/prisma');
    const prisma = prismaModule.default;

    (prisma.after_sales.findFirst as any).mockResolvedValue(null);

    const result = await AfterSalesIntegrationService.findIdBySerialNumber(999);
    expect(result).toBeNull();
  });

  it('should update quality loss fields', async () => {
    const { AfterSalesIntegrationService } = await import(
      '~/modules/after-sales/after-sales-integration.service'
    );
    const prismaModule = await import('~/utils/prisma');
    const prisma = prismaModule.default;

    (prisma.after_sales.update as any).mockResolvedValue({});

    await AfterSalesIntegrationService.updateQualityLossFields({
      actualClaim: 50,
      id: 'as-1',
    });

    expect(prisma.after_sales.update).toHaveBeenCalledWith({
      where: { id: 'as-1' },
      data: expect.objectContaining({
        actualClaim: 50,
        updatedAt: expect.any(Date),
      }),
    });
    expect(prisma.after_sales.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ claimStatus: expect.anything() }),
      }),
    );
  });

  it('should get quality loss trend rows for month granularity', async () => {
    const { AfterSalesIntegrationService } = await import(
      '~/modules/after-sales/after-sales-integration.service'
    );
    const prismaModule = await import('~/utils/prisma');
    const prisma = prismaModule.default;

    (prisma.$queryRaw as any).mockResolvedValue([
      { a: 500, p: 1 },
      { a: 300, p: 2 },
    ]);

    const result = await AfterSalesIntegrationService.getQualityLossTrendRows({
      granularity: 'month',
      year: 2026,
    });

    expect(result).toEqual([
      { a: 500, p: 1 },
      { a: 300, p: 2 },
    ]);
  });

  it('should get quality loss trend rows for week granularity', async () => {
    const { AfterSalesIntegrationService } = await import(
      '~/modules/after-sales/after-sales-integration.service'
    );
    const prismaModule = await import('~/utils/prisma');
    const prisma = prismaModule.default;

    (prisma.$queryRaw as any).mockResolvedValue([{ a: 100, p: 1 }]);

    await AfterSalesIntegrationService.getQualityLossTrendRows({
      granularity: 'week',
      year: 2026,
    });

    expect(prisma.$queryRaw).toHaveBeenCalled();
  });

  it('should get loss records with optional params', async () => {
    const { AfterSalesIntegrationService } = await import(
      '~/modules/after-sales/after-sales-integration.service'
    );
    const prismaModule = await import('~/utils/prisma');
    const prisma = prismaModule.default;

    (prisma.after_sales.findMany as any).mockResolvedValue([{ id: 'as-1' }]);

    const result =
      await AfterSalesIntegrationService.getLossRecordsForAggregation({
        skip: 0,
        take: 10,
        workOrderNumber: 'WO-123',
      });

    expect(result).toEqual([{ id: 'as-1' }]);
    expect(prisma.after_sales.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workOrderNumber: { contains: 'WO-123' },
        }),
        skip: 0,
        take: 10,
      }),
    );
  });

  it('should get loss records without optional params', async () => {
    const { AfterSalesIntegrationService } = await import(
      '~/modules/after-sales/after-sales-integration.service'
    );
    const prismaModule = await import('~/utils/prisma');
    const prisma = prismaModule.default;

    (prisma.after_sales.findMany as any).mockResolvedValue([]);

    await AfterSalesIntegrationService.getLossRecordsForAggregation();

    expect(prisma.after_sales.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isDeleted: false },
      }),
    );
  });

  it('should count loss records', async () => {
    const { AfterSalesIntegrationService } = await import(
      '~/modules/after-sales/after-sales-integration.service'
    );
    const prismaModule = await import('~/utils/prisma');
    const prisma = prismaModule.default;

    (prisma.after_sales.count as any).mockResolvedValue(5);

    const result =
      await AfterSalesIntegrationService.countLossRecordsForAggregation({
        workOrderNumber: 'WO',
      });

    expect(result).toBe(5);
  });

  it('should get drill down records', async () => {
    const { AfterSalesIntegrationService } = await import(
      '~/modules/after-sales/after-sales-integration.service'
    );
    const prismaModule = await import('~/utils/prisma');
    const prisma = prismaModule.default;

    (prisma.after_sales.findMany as any).mockResolvedValue([{ id: 'as-1' }]);

    const result =
      await AfterSalesIntegrationService.getQualityLossDrillDownRecords({
        end: new Date('2026-01-31'),
        start: new Date('2026-01-01'),
        take: 5,
      });

    expect(result).toEqual([{ id: 'as-1' }]);
  });

  it('should get supplier scoring data', async () => {
    const { AfterSalesIntegrationService } = await import(
      '~/modules/after-sales/after-sales-integration.service'
    );
    const prismaModule = await import('~/utils/prisma');
    const prisma = prismaModule.default;

    (prisma.after_sales.groupBy as any)
      .mockResolvedValueOnce([
        {
          supplierBrand: 'A',
          _sum: { materialCost: 100, laborTravelCost: 50 },
          _count: { id: 3 },
        },
      ])
      .mockResolvedValueOnce([
        { supplierBrand: 'A', claimStatus: 'OPEN', _count: { id: 2 } },
      ]);
    (prisma.after_sales.findMany as any).mockResolvedValue([
      {
        supplierBrand: 'A',
        materialCost: 100,
        laborTravelCost: 50,
        severity: 'High',
        occurDate: new Date(),
      },
    ]);

    const result = await AfterSalesIntegrationService.getSupplierScoringData({
      since: new Date('2026-01-01'),
      supplierNames: ['A'],
    });

    expect(result.stats).toHaveLength(1);
    expect(result.statusStats).toHaveLength(1);
    expect(result.records).toHaveLength(1);
  });

  it('should get weekly report issues', async () => {
    const { AfterSalesIntegrationService } = await import(
      '~/modules/after-sales/after-sales-integration.service'
    );
    const prismaModule = await import('~/utils/prisma');
    const prisma = prismaModule.default;

    (prisma.after_sales.findMany as any).mockResolvedValue([{ id: 'as-1' }]);

    const result = await AfterSalesIntegrationService.getWeeklyReportIssues({
      end: new Date('2026-01-07'),
      start: new Date('2026-01-01'),
    });

    expect(result).toEqual([{ id: 'as-1' }]);
  });

  it('should get report period metrics with grossCost / recovered / netLoss', async () => {
    const { AfterSalesIntegrationService } = await import(
      '~/modules/after-sales/after-sales-integration.service'
    );
    const prismaModule = await import('~/utils/prisma');
    const prisma = prismaModule.default;

    (prisma.after_sales.aggregate as any).mockResolvedValue({
      _sum: { actualClaim: 250, laborTravelCost: 200, materialCost: 500 },
    });

    const result = await AfterSalesIntegrationService.getReportPeriodMetrics({
      end: new Date('2026-01-31'),
      start: new Date('2026-01-01'),
    });

    expect(result).toEqual({
      grossCost: 700,
      netLoss: 450,
      recovered: 250,
    });
  });

  it('should treat null sums as zero in report period metrics', async () => {
    const { AfterSalesIntegrationService } = await import(
      '~/modules/after-sales/after-sales-integration.service'
    );
    const prismaModule = await import('~/utils/prisma');
    const prisma = prismaModule.default;

    (prisma.after_sales.aggregate as any).mockResolvedValue({
      _sum: { actualClaim: null, laborTravelCost: null, materialCost: null },
    });

    const result = await AfterSalesIntegrationService.getReportPeriodMetrics({
      end: new Date('2026-01-31'),
      start: new Date('2026-01-01'),
    });

    expect(result).toEqual({
      grossCost: 0,
      netLoss: 0,
      recovered: 0,
    });
  });

  it('should get stats for dashboard', async () => {
    const { AfterSalesIntegrationService } = await import(
      '~/modules/after-sales/after-sales-integration.service'
    );
    const prismaModule = await import('~/utils/prisma');
    const prisma = prismaModule.default;

    (prisma.after_sales.aggregate as any)
      .mockResolvedValueOnce({
        _count: { id: 20 },
        _sum: { materialCost: 1000, laborTravelCost: 500 },
      })
      .mockResolvedValueOnce({
        _sum: { materialCost: 200, laborTravelCost: 100 },
      });
    (prisma.after_sales.count as any).mockResolvedValue(5);

    const result = await AfterSalesIntegrationService.getStatsForDashboard({
      weekStart: new Date('2026-01-06'),
      yearStart: new Date('2026-01-01'),
    });

    expect(result).toEqual({
      totalCount: 20,
      totalLoss: 1500,
      weeklyCount: 5,
      weeklyLoss: 300,
    });
  });

  it('should get vehicle failure records with division filter', async () => {
    const { AfterSalesIntegrationService } = await import(
      '~/modules/after-sales/after-sales-integration.service'
    );
    const prismaModule = await import('~/utils/prisma');
    const prisma = prismaModule.default;

    (prisma.after_sales.findMany as any).mockResolvedValue([
      { defectType: 'Engine', defectTypeId: 'dt-1', occurDate: new Date() },
    ]);

    const result = await AfterSalesIntegrationService.getVehicleFailureRecords({
      end: new Date('2026-01-31'),
      productType: 'Vehicle',
      start: new Date('2026-01-01'),
      vehicleDeptIds: ['dept-1'],
    });

    expect(result).toHaveLength(1);
  });

  it('should find earliest vehicle failure date', async () => {
    const { AfterSalesIntegrationService } = await import(
      '~/modules/after-sales/after-sales-integration.service'
    );
    const prismaModule = await import('~/utils/prisma');
    const prisma = prismaModule.default;

    (prisma.after_sales.findFirst as any).mockResolvedValue({
      occurDate: new Date('2026-01-05'),
    });

    const result =
      await AfterSalesIntegrationService.findEarliestVehicleFailureDate({
        end: new Date('2026-01-31'),
        productType: 'Vehicle',
        vehicleDeptIds: [],
      });

    expect(result).toEqual(new Date('2026-01-05'));
  });

  it('should return null when no vehicle failure records exist', async () => {
    const { AfterSalesIntegrationService } = await import(
      '~/modules/after-sales/after-sales-integration.service'
    );
    const prismaModule = await import('~/utils/prisma');
    const prisma = prismaModule.default;

    (prisma.after_sales.findFirst as any).mockResolvedValue(null);

    const result =
      await AfterSalesIntegrationService.findEarliestVehicleFailureDate({
        end: new Date('2026-01-31'),
        productType: 'Vehicle',
        vehicleDeptIds: [],
      });

    expect(result).toBeNull();
  });
});
