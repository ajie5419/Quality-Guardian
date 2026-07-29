import { QMS_DEFAULT_VALUES } from '@qgs/shared';
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

vi.mock('~/utils/canonical-master-data', () => ({
  MasterDataGovernanceKernel: {
    resolveCanonicalNamesByIds: vi.fn(
      async ({ canonicalIds }: { canonicalIds: Array<null | string> }) =>
        new Map(canonicalIds.filter(Boolean).map((id) => [id, null])),
    ),
  },
}));

vi.mock('~/modules/quality-classification', () => {
  const listForManagement = vi.fn().mockResolvedValue([]);
  return {
    QualityClassificationService: {
      listForManagement,
      resolveCategoryNamesByIds: vi.fn(async () => {
        const categories = await listForManagement();
        return new Map(
          categories.map((item: { id: string; name: string }) => [
            item.id,
            item.name,
          ]),
        );
      }),
    },
  };
});

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
        { defectCategoryId: 'defect-1', _count: { id: 6 } },
        { defectCategoryId: 'defect-2', _count: { id: 4 } },
      ])
      .mockResolvedValueOnce([
        { supplierBrandId: 'supplier-1', _count: { id: 5 } },
      ])
      .mockResolvedValueOnce([{ respDeptId: 'dept-1', _count: { id: 7 } }]);
    const { MasterDataGovernanceKernel } = await import(
      '~/utils/canonical-master-data'
    );
    const { QualityClassificationService } = await import(
      '~/modules/quality-classification'
    );
    vi.mocked(
      QualityClassificationService.listForManagement,
    ).mockResolvedValueOnce([
      {
        code: 'MECHANICAL',
        id: 'defect-1',
        name: 'Mechanical',
        scope: 'AFTER_SALES_DEFECT',
        sort: 0,
        status: 1,
        subcategories: [],
      },
      {
        code: 'ELECTRICAL',
        id: 'defect-2',
        name: 'Electrical',
        scope: 'AFTER_SALES_DEFECT',
        sort: 1,
        status: 1,
        subcategories: [],
      },
    ]);
    (MasterDataGovernanceKernel.resolveCanonicalNamesByIds as any)
      .mockResolvedValueOnce(new Map([['supplier-1', 'Supplier A']]))
      .mockResolvedValueOnce(new Map([['dept-1', 'QA']]));

    const stats = await AfterSalesAnalyticsService.getStats({ year: 2026 });

    expect(stats.kpi.total).toBe(10);
    expect(stats.kpi.open).toBe(3);
    expect(stats.kpi.cost).toBe(1500);
    expect(stats.kpi.avgTime).toBe(5.5);
    expect(stats.defectDistribution).toHaveLength(2);
    expect(stats.supplierRanking).toEqual([
      {
        id: 'supplier-1',
        name: 'Supplier A',
        resolutionStatus: 'RESOLVED',
        value: 5,
      },
    ]);
    expect(stats.deptDistribution).toHaveLength(1);
    expect(prisma.after_sales.groupBy).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ by: ['defectCategoryId'] }),
    );
    expect(prisma.after_sales.groupBy).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ by: ['supplierBrandId'] }),
    );
    expect(prisma.after_sales.groupBy).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ by: ['respDeptId'] }),
    );
  });

  it('should keep canonical identities distinct and handle unresolved IDs', async () => {
    const { AfterSalesAnalyticsService } = await import(
      '~/modules/after-sales/after-sales-analytics.service'
    );
    const prismaModule = await import('~/utils/prisma');
    const prisma = prismaModule.default;
    const { MasterDataGovernanceKernel } = await import(
      '~/utils/canonical-master-data'
    );
    const { QualityClassificationService } = await import(
      '~/modules/quality-classification'
    );

    (prisma.after_sales.aggregate as any).mockResolvedValue({
      _count: { id: 8 },
      _sum: { laborTravelCost: 0, materialCost: 0 },
    });
    (prisma.after_sales.count as any).mockResolvedValue(0);
    (prisma.$queryRaw as any)
      .mockResolvedValueOnce([{ avgDays: 0 }])
      .mockResolvedValueOnce([]);
    (prisma.after_sales.groupBy as any)
      .mockResolvedValueOnce([
        { defectCategoryId: 'defect-a', _count: { id: 3 } },
        { defectCategoryId: 'defect-b', _count: { id: 2 } },
        { defectCategoryId: null, _count: { id: 1 } },
        { defectCategoryId: 'invalid-defect', _count: { id: 2 } },
      ])
      .mockResolvedValueOnce([
        { supplierBrandId: 'supplier-a', _count: { id: 4 } },
        { supplierBrandId: 'supplier-b', _count: { id: 2 } },
        { supplierBrandId: null, _count: { id: 1 } },
        { supplierBrandId: 'invalid-supplier', _count: { id: 1 } },
      ])
      .mockResolvedValueOnce([
        { respDeptId: null, _count: { id: 1 } },
        { respDeptId: 'invalid-dept', _count: { id: 1 } },
      ]);
    vi.mocked(
      QualityClassificationService.listForManagement,
    ).mockResolvedValueOnce([
      {
        code: 'DEFECT_A',
        id: 'defect-a',
        name: 'Shared defect',
        scope: 'AFTER_SALES_DEFECT',
        sort: 0,
        status: 1,
        subcategories: [],
      },
      {
        code: 'DEFECT_B',
        id: 'defect-b',
        name: 'Shared defect',
        scope: 'AFTER_SALES_DEFECT',
        sort: 1,
        status: 1,
        subcategories: [],
      },
    ]);
    (MasterDataGovernanceKernel.resolveCanonicalNamesByIds as any)
      .mockResolvedValueOnce(
        new Map([
          ['invalid-supplier', null],
          ['supplier-a', 'Shared supplier'],
          ['supplier-b', 'Shared supplier'],
        ]),
      )
      .mockResolvedValueOnce(new Map([['invalid-dept', null]]));

    const stats = await AfterSalesAnalyticsService.getStats({ year: 2026 });

    expect(stats.defectDistribution).toEqual([
      {
        id: 'defect-a',
        name: 'Shared defect',
        resolutionStatus: 'RESOLVED',
        value: 3,
      },
      {
        id: 'defect-b',
        name: 'Shared defect',
        resolutionStatus: 'RESOLVED',
        value: 2,
      },
      {
        id: null,
        name: QMS_DEFAULT_VALUES.UNCLASSIFIED,
        resolutionReason: 'MISSING_REQUIRED',
        resolutionStatus: 'MISSING',
        value: 1,
      },
      {
        id: 'invalid-defect',
        name: '主数据已失效',
        resolutionReason: 'INVALID_REFERENCE',
        resolutionStatus: 'INVALID',
        value: 2,
      },
    ]);
    expect(stats.supplierRanking).toEqual([
      {
        id: 'supplier-a',
        name: 'Shared supplier',
        resolutionStatus: 'RESOLVED',
        value: 4,
      },
      {
        id: 'supplier-b',
        name: 'Shared supplier',
        resolutionStatus: 'RESOLVED',
        value: 2,
      },
      {
        id: null,
        name: '未关联供应商',
        resolutionReason: 'NOT_APPLICABLE',
        resolutionStatus: 'MISSING',
        value: 1,
      },
      {
        id: 'invalid-supplier',
        name: '主数据已失效',
        resolutionReason: 'INVALID_REFERENCE',
        resolutionStatus: 'INVALID',
        value: 1,
      },
    ]);
    expect(stats.deptDistribution).toEqual([
      {
        id: null,
        name: QMS_DEFAULT_VALUES.UNASSIGNED,
        resolutionReason: 'MISSING_REQUIRED',
        resolutionStatus: 'MISSING',
        value: 1,
      },
      {
        id: 'invalid-dept',
        name: '主数据已失效',
        resolutionReason: 'INVALID_REFERENCE',
        resolutionStatus: 'INVALID',
        value: 1,
      },
    ]);
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
    expect(stats.supplierRanking).toEqual([]);
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
