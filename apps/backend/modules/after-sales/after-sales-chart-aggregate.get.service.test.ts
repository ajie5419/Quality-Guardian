import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('h3', () => ({
  defineEventHandler: (fn: any) => fn,
}));

vi.mock('~/utils/prisma', () => ({
  default: {
    after_sales: {
      aggregate: vi.fn(),
      count: vi.fn(),
      findMany: vi.fn(),
      groupBy: vi.fn(),
    },
    $queryRaw: vi.fn(),
  },
}));

vi.mock('~/modules/after-sales/after-sales-query', () => ({
  parseAfterSalesDateMode: vi.fn((mode: any) => mode ?? 'year'),
  parseAfterSalesDateValue: vi.fn((value: any) => value),
}));

vi.mock('~/modules/after-sales/after-sales.service', () => ({
  AfterSalesService: {
    getChartAggregation: vi.fn(),
  },
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
  useResponseSuccess: vi.fn((data: any) => ({ data, success: true })),
}));

vi.mock('~/utils/api-logger', () => ({
  logApiError: vi.fn(),
}));

vi.mock('~/utils/define-validated-handler', () => ({
  defineValidatedHandler: vi.fn(
    (_schema: any, handler: any) => (event: any) =>
      handler(event, (event as any).query),
  ),
}));

describe('after-sales-chart-aggregate.get.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return chart aggregation items', async () => {
    const { AfterSalesService } = await import(
      '~/modules/after-sales/after-sales.service'
    );

    vi.mocked(AfterSalesService.getChartAggregation).mockResolvedValue([
      { name: 'Mechanical', value: 10 },
    ] as never);

    const handlerModule = await import(
      '~/modules/after-sales/after-sales-chart-aggregate.get.service'
    );
    const handler = handlerModule.default;

    const result = await handler({
      context: { dataScope: undefined },
      query: {
        dateMode: 'year',
        dimension: 'defectType',
        metric: 'count',
        year: '2026',
      },
    } as any);

    expect(result).toEqual({
      data: { items: [{ name: 'Mechanical', value: 10 }] },
      success: true,
    });
    expect(AfterSalesService.getChartAggregation).toHaveBeenCalledWith(
      expect.objectContaining({
        dimension: 'defectType',
        metric: 'count',
      }),
    );
  });

  it('should use default top of 15 when not provided', async () => {
    const { AfterSalesService } = await import(
      '~/modules/after-sales/after-sales.service'
    );

    vi.mocked(AfterSalesService.getChartAggregation).mockResolvedValue([]);

    const handlerModule = await import(
      '~/modules/after-sales/after-sales-chart-aggregate.get.service'
    );
    const handler = handlerModule.default;

    await handler({
      context: { dataScope: undefined },
      query: { dimension: 'severity', metric: 'totalLoss' },
    } as any);

    expect(AfterSalesService.getChartAggregation).toHaveBeenCalledWith(
      expect.objectContaining({ top: 15 }),
    );
  });

  it('should return internal error when service throws', async () => {
    const { AfterSalesService } = await import(
      '~/modules/after-sales/after-sales.service'
    );

    vi.mocked(AfterSalesService.getChartAggregation).mockRejectedValue(
      new Error('db error'),
    );

    const handlerModule = await import(
      '~/modules/after-sales/after-sales-chart-aggregate.get.service'
    );
    const handler = handlerModule.default;

    const result = await handler({
      context: { dataScope: undefined },
      query: { dimension: 'defectType', metric: 'count' },
    } as any);

    expect(result).toEqual({
      error: true,
      message: 'Failed to fetch after-sales chart aggregate',
    });
  });
});
