import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('h3', () => ({
  defineEventHandler: (fn: any) => fn,
}));

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
    buildAfterSalesWhere: vi.fn(async (where: any) => where),
    getDeptCandidates: vi.fn(),
    getScopeForModule: vi.fn(),
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

vi.mock('~/modules/file-storage/file-storage.service', () => ({
  FileStorageService: {
    registerReferencesFromAttachments: vi.fn(),
    softDeleteReferences: vi.fn(),
  },
}));

vi.mock('~/modules/system-log/system-log.service', () => ({
  SystemLogService: {
    auditLog: vi.fn(),
  },
}));

vi.mock('~/modules/after-sales/after-sales-chart-aggregation.service', () => ({
  AfterSalesChartAggregationService: {
    getChartAggregation: vi.fn(async () => [{ name: 'Mechanical', value: 6 }]),
  },
}));

vi.mock('~/modules/after-sales/after-sales-payload', () => ({
  buildGovernedAfterSalesUpdateData: vi.fn(
    async (body: Record<string, unknown>) => ({
      costsChanged: Boolean(body.materialCost || body.laborTravelCost),
      data: body,
    }),
  ),
}));

vi.mock('~/utils/current-user', () => ({
  getCurrentUser: vi.fn(() => ({
    id: 'user-1',
    userId: 'user-1',
    username: 'admin',
  })),
}));

vi.mock('~/utils/response', () => ({
  internalServerErrorResponse: vi.fn((_event: any, message: string) => ({
    error: true,
    message,
  })),
  notFoundResponse: vi.fn((_event: any, message: string) => ({
    error: true,
    message,
    status: 404,
  })),
  useResponseSuccess: vi.fn((data: any) => ({ data, success: true })),
}));

vi.mock('~/utils/api-logger', () => ({
  logApiError: vi.fn(),
}));

vi.mock('~/utils/prisma-error', () => ({
  isPrismaNotFoundError: vi.fn(
    (error: unknown) => error instanceof Error && error.message === 'not found',
  ),
}));

vi.mock('~/utils/route-param', () => ({
  getRequiredRouterParam: vi.fn(
    (_event: any, _name: string, _msg: string) => 'test-id',
  ),
}));

vi.mock('~/utils/define-validated-handler', () => ({
  defineValidatedHandler: vi.fn(
    (_schema: any, handler: any) => (event: any, query: any) =>
      handler(event, query),
  ),
}));

describe('after-sales-analytics.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return stats with KPI and distributions', async () => {
    const { AfterSalesAnalyticsService } = await import(
      '~/modules/after-sales/after-sales-analytics.service'
    );
    const prismaModule = await import('~/utils/prisma');
    const prisma = prismaModule.default;

    (prisma.after_sales.aggregate as any).mockResolvedValue({
      _count: { id: 10 },
      _sum: { laborTravelCost: 500, materialCost: 1000 },
    });
    (prisma.after_sales.count as any).mockResolvedValue(3);
    (prisma.$queryRaw as any)
      .mockResolvedValueOnce([{ avgDays: 5.5 }])
      .mockResolvedValueOnce([
        { period: 1, issues: 5n, costs: 300, closed: 3n },
        { period: 2, issues: 5n, costs: 700, closed: 2n },
      ]);
    (prisma.after_sales.groupBy as any)
      .mockResolvedValueOnce([
        { defectType: 'Mechanical', _count: { id: 6 } },
        { defectType: 'Electrical', _count: { id: 4 } },
      ])
      .mockResolvedValueOnce([
        { supplierBrand: 'Supplier A', _count: { id: 5 } },
      ])
      .mockResolvedValueOnce([{ respDept: 'QA', _count: { id: 7 } }]);

    const stats = await AfterSalesAnalyticsService.getStats({ year: 2026 });

    expect(stats.kpi.total).toBe(10);
    expect(stats.kpi.open).toBe(3);
    expect(stats.kpi.cost).toBe(1500);
    expect(stats.kpi.avgTime).toBe(5.5);
    expect(stats.defectDistribution).toHaveLength(2);
    expect(stats.supplierRanking.categories).toEqual(['Supplier A']);
    expect(stats.deptDistribution).toHaveLength(1);
  });

  it('should return empty stats when query fails', async () => {
    const { AfterSalesAnalyticsService } = await import(
      '~/modules/after-sales/after-sales-analytics.service'
    );
    const prismaModule = await import('~/utils/prisma');
    const prisma = prismaModule.default;

    (prisma.after_sales.aggregate as any).mockRejectedValue(
      new Error('db unavailable'),
    );

    const stats = await AfterSalesAnalyticsService.getStats({ year: 2026 });

    expect(stats.kpi).toEqual({ avgTime: 0, cost: 0, open: 0, total: 0 });
    expect(stats.defectDistribution).toEqual([]);
    expect(stats.supplierRanking).toEqual({ categories: [], data: [] });
    expect(stats.deptDistribution).toEqual([]);
  });

  it('should delegate getChartAggregation to chart aggregation service', async () => {
    const { AfterSalesAnalyticsService } = await import(
      '~/modules/after-sales/after-sales-analytics.service'
    );

    const result = await AfterSalesAnalyticsService.getChartAggregation({
      dimension: 'defectType',
      metric: 'count',
      year: 2026,
    });

    expect(Array.isArray(result)).toBe(true);
  });
});
