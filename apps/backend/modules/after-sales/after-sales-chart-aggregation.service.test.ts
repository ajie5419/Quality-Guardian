import { QMS_DEFAULT_VALUES } from '@qgs/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('~/utils/prisma', () => ({
  default: {
    after_sales: {
      findMany: vi.fn(),
      groupBy: vi.fn(),
    },
  },
}));

vi.mock('~/modules/data-scope/data-scope.service', () => ({
  DataScopeService: {
    buildAfterSalesWhere: vi.fn(async (where: any) => where),
  },
}));

vi.mock('~/utils/canonical-master-data', () => ({
  MasterDataGovernanceKernel: {
    resolveCanonicalNamesByIds: vi.fn().mockResolvedValue(new Map()),
  },
}));

describe('after-sales-chart-aggregation.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should aggregate by defectType with count metric', async () => {
    const { AfterSalesChartAggregationService } = await import(
      '~/modules/after-sales/after-sales-chart-aggregation.service'
    );
    const prismaModule = await import('~/utils/prisma');
    const prisma = prismaModule.default;
    const { MasterDataGovernanceKernel } = await import(
      '~/utils/canonical-master-data'
    );

    (prisma.after_sales.groupBy as any).mockResolvedValue([
      { defectTypeId: 'defect-mechanical', _count: { id: 10 } },
      { defectTypeId: 'defect-electrical', _count: { id: 5 } },
    ]);
    vi.mocked(
      MasterDataGovernanceKernel.resolveCanonicalNamesByIds,
    ).mockResolvedValue(
      new Map([
        ['defect-electrical', 'Electrical'],
        ['defect-mechanical', 'Mechanical'],
      ]),
    );

    const result = await AfterSalesChartAggregationService.getChartAggregation({
      dimension: 'defectType',
      metric: 'count',
      year: 2026,
    });

    expect(result).toEqual([
      {
        id: 'defect-mechanical',
        name: 'Mechanical',
        resolutionStatus: 'RESOLVED',
        value: 10,
      },
      {
        id: 'defect-electrical',
        name: 'Electrical',
        resolutionStatus: 'RESOLVED',
        value: 5,
      },
    ]);
    expect(prisma.after_sales.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ by: ['defectTypeId'] }),
    );
  });

  it('should aggregate by responsibleDept with totalLoss metric and resolve dept names', async () => {
    const { AfterSalesChartAggregationService } = await import(
      '~/modules/after-sales/after-sales-chart-aggregation.service'
    );
    const prismaModule = await import('~/utils/prisma');
    const prisma = prismaModule.default;
    const { MasterDataGovernanceKernel } = await import(
      '~/utils/canonical-master-data'
    );

    (prisma.after_sales.groupBy as any).mockResolvedValue([
      {
        respDeptId: 'dept-1',
        _sum: { materialCost: 100, laborTravelCost: 25 },
      },
      {
        respDeptId: 'dept-2',
        _sum: { materialCost: 20, laborTravelCost: 5 },
      },
    ]);
    vi.mocked(
      MasterDataGovernanceKernel.resolveCanonicalNamesByIds,
    ).mockResolvedValue(
      new Map([
        ['dept-1', 'Quality'],
        ['dept-2', 'Service'],
      ]),
    );

    const result = await AfterSalesChartAggregationService.getChartAggregation({
      dimension: 'responsibleDept',
      metric: 'totalLoss',
      top: 5,
      year: 2026,
    });

    expect(result).toEqual([
      {
        id: 'dept-1',
        name: 'Quality',
        resolutionStatus: 'RESOLVED',
        value: 125,
      },
      {
        id: 'dept-2',
        name: 'Service',
        resolutionStatus: 'RESOLVED',
        value: 25,
      },
    ]);
    expect(prisma.after_sales.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ by: ['respDeptId'] }),
    );
  });

  it('should aggregate reportMonth with totalLoss metric', async () => {
    const { AfterSalesChartAggregationService } = await import(
      '~/modules/after-sales/after-sales-chart-aggregation.service'
    );
    const prismaModule = await import('~/utils/prisma');
    const prisma = prismaModule.default;

    (prisma.after_sales.findMany as any).mockResolvedValue([
      {
        occurDate: new Date('2026-01-15T00:00:00.000Z'),
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
    ]);

    const result = await AfterSalesChartAggregationService.getChartAggregation({
      dimension: 'reportMonth',
      metric: 'totalLoss',
      year: 2026,
    });

    expect(result).toEqual([
      {
        id: '2026-01',
        name: '2026-01',
        resolutionStatus: 'RESOLVED',
        value: 120,
      },
    ]);
  });

  it('should limit results to top N items sorted by value desc', async () => {
    const { AfterSalesChartAggregationService } = await import(
      '~/modules/after-sales/after-sales-chart-aggregation.service'
    );
    const prismaModule = await import('~/utils/prisma');
    const prisma = prismaModule.default;
    const { MasterDataGovernanceKernel } = await import(
      '~/utils/canonical-master-data'
    );

    (prisma.after_sales.groupBy as any).mockResolvedValue([
      { defectTypeId: 'defect-a', _count: { id: 3 } },
      { defectTypeId: 'defect-b', _count: { id: 10 } },
      { defectTypeId: 'defect-c', _count: { id: 7 } },
    ]);
    vi.mocked(
      MasterDataGovernanceKernel.resolveCanonicalNamesByIds,
    ).mockResolvedValue(
      new Map([
        ['defect-a', 'A'],
        ['defect-b', 'B'],
        ['defect-c', 'C'],
      ]),
    );

    const result = await AfterSalesChartAggregationService.getChartAggregation({
      dimension: 'defectType',
      metric: 'count',
      top: 2,
      year: 2026,
    });

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      id: 'defect-b',
      name: 'B',
      resolutionStatus: 'RESOLVED',
      value: 10,
    });
    expect(result[1]).toEqual({
      id: 'defect-c',
      name: 'C',
      resolutionStatus: 'RESOLVED',
      value: 7,
    });
  });

  it('should handle null field values as UNCLASSIFIED', async () => {
    const { AfterSalesChartAggregationService } = await import(
      '~/modules/after-sales/after-sales-chart-aggregation.service'
    );
    const prismaModule = await import('~/utils/prisma');
    const prisma = prismaModule.default;

    (prisma.after_sales.groupBy as any).mockResolvedValue([
      { defectTypeId: null, _count: { id: 4 } },
    ]);

    const result = await AfterSalesChartAggregationService.getChartAggregation({
      dimension: 'defectType',
      metric: 'count',
      year: 2026,
    });

    expect(result[0]).toEqual({
      id: null,
      name: QMS_DEFAULT_VALUES.UNCLASSIFIED,
      resolutionStatus: 'MISSING',
      value: 4,
    });
  });
});
