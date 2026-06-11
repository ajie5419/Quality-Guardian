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

vi.mock('~/modules/dept/dept.service', () => ({
  DeptService: {
    findAll: vi.fn(),
  },
}));

vi.mock('~/modules/dept/dept-tree', () => ({
  flattenDeptTree: vi.fn((tree: any[]) => {
    const result: any[] = [];
    const walk = (nodes: any[]) => {
      for (const node of nodes) {
        result.push(node);
        if (node.children) walk(node.children);
      }
    };
    walk(tree);
    return result;
  }),
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

    (prisma.after_sales.groupBy as any).mockResolvedValue([
      { defectType: 'Mechanical', _count: { id: 10 } },
      { defectType: 'Electrical', _count: { id: 5 } },
    ]);

    const result = await AfterSalesChartAggregationService.getChartAggregation({
      dimension: 'defectType',
      metric: 'count',
      year: 2026,
    });

    expect(result).toEqual([
      { name: 'Mechanical', value: 10 },
      { name: 'Electrical', value: 5 },
    ]);
  });

  it('should aggregate by responsibleDept with totalLoss metric and resolve dept names', async () => {
    const { AfterSalesChartAggregationService } = await import(
      '~/modules/after-sales/after-sales-chart-aggregation.service'
    );
    const { DeptService } = await import('~/modules/dept/dept.service');
    const prismaModule = await import('~/utils/prisma');
    const prisma = prismaModule.default;

    (prisma.after_sales.groupBy as any).mockResolvedValue([
      {
        respDept: 'dept-1',
        _sum: { materialCost: 100, laborTravelCost: 25 },
      },
      {
        respDept: 'dept-2',
        _sum: { materialCost: 20, laborTravelCost: 5 },
      },
    ]);
    vi.mocked(DeptService.findAll).mockResolvedValue([
      { id: 'dept-1', name: 'Quality', children: [] },
      { id: 'dept-2', name: 'Service', children: [] },
    ] as never);

    const result = await AfterSalesChartAggregationService.getChartAggregation({
      dimension: 'responsibleDept',
      metric: 'totalLoss',
      top: 5,
      year: 2026,
    });

    expect(result).toEqual([
      { name: 'Quality', value: 125 },
      { name: 'Service', value: 25 },
    ]);
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

    expect(result).toEqual([{ name: '2026-01', value: 120 }]);
  });

  it('should limit results to top N items sorted by value desc', async () => {
    const { AfterSalesChartAggregationService } = await import(
      '~/modules/after-sales/after-sales-chart-aggregation.service'
    );
    const prismaModule = await import('~/utils/prisma');
    const prisma = prismaModule.default;

    (prisma.after_sales.groupBy as any).mockResolvedValue([
      { defectType: 'A', _count: { id: 3 } },
      { defectType: 'B', _count: { id: 10 } },
      { defectType: 'C', _count: { id: 7 } },
    ]);

    const result = await AfterSalesChartAggregationService.getChartAggregation({
      dimension: 'defectType',
      metric: 'count',
      top: 2,
      year: 2026,
    });

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ name: 'B', value: 10 });
    expect(result[1]).toEqual({ name: 'C', value: 7 });
  });

  it('should handle null field values as UNCLASSIFIED', async () => {
    const { AfterSalesChartAggregationService } = await import(
      '~/modules/after-sales/after-sales-chart-aggregation.service'
    );
    const prismaModule = await import('~/utils/prisma');
    const prisma = prismaModule.default;

    (prisma.after_sales.groupBy as any).mockResolvedValue([
      { defectType: null, _count: { id: 4 } },
    ]);

    const result = await AfterSalesChartAggregationService.getChartAggregation({
      dimension: 'defectType',
      metric: 'count',
      year: 2026,
    });

    expect(result[0].name).toBeTruthy();
    expect(result[0].value).toBe(4);
  });
});
