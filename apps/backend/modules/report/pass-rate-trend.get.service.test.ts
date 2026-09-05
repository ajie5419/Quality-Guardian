import { beforeEach, describe, expect, it, vi } from 'vitest';
import handler from '~/modules/report/pass-rate-trend.get.service';

vi.mock('~/modules/report/pass-rate', () => ({
  createPassRateTargetResolver: vi.fn().mockResolvedValue(() => 95),
  getNetPassRateSummaryByRange: vi.fn().mockResolvedValue({
    passCount: 90,
    passRate: 90,
    totalCount: 100,
  }),
  getPassRateDrillDownByRange: vi.fn().mockResolvedValue([
    {
      category: 'INCOMING',
      passCount: 50,
      passRate: 96,
      process: '进货检验',
      targetPassRate: 95,
      totalCount: 52,
    },
  ]),
}));

vi.mock('h3', () => ({
  defineEventHandler: (fn: (...args: unknown[]) => unknown) => fn,
  getQuery: vi.fn().mockReturnValue({}),
}));

vi.mock('~/utils/api-logger', () => ({
  logApiError: vi.fn(),
}));

vi.mock('~/utils/response', () => ({
  internalServerErrorResponse: vi
    .fn()
    .mockImplementation((_event: any, msg: string) => ({
      _error: true,
      message: msg,
    })),
  useResponseSuccess: vi.fn().mockImplementation((data: unknown) => ({
    _success: true,
    data,
  })),
}));

const testEvent = {
  context: { user: { id: 'u1', username: 'u1', realName: 'U1' } },
  node: { req: {}, res: {} },
} as any;

describe('passRateTrendGetService handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns trend data for weekly granularity by default', async () => {
    const result = await handler(testEvent);

    expect(result.data).toHaveProperty('trend');
    expect(result.data.trend).toBeInstanceOf(Array);
    expect(result.data.trend.length).toBeGreaterThan(0);
  });

  it('forwards the middleware-resolved data scope to pass-rate reads', async () => {
    const { getNetPassRateSummaryByRange } = await import(
      '~/modules/report/pass-rate'
    );
    testEvent.context.dataScope = {
      deptIds: ['dept-a'],
      module: 'inspection',
      scopeType: 'DEPT',
    };

    await handler(testEvent);

    expect(getNetPassRateSummaryByRange).toHaveBeenCalledWith(
      expect.any(Date),
      expect.any(Date),
      'inspection',
      expect.objectContaining({
        dataScope: expect.objectContaining({ scopeType: 'DEPT' }),
      }),
    );
    delete testEvent.context.dataScope;
  });

  it('returns trend data for monthly granularity', async () => {
    const { getQuery } = await import('h3');
    (getQuery as any).mockReturnValue({ granularity: 'month' });

    const result = await handler(testEvent);

    expect(result.data).toHaveProperty('trend');
    expect(result.data.trend).toHaveLength(12);
  });

  it('returns trend data for weekly granularity with 4 weeks', async () => {
    const { getQuery } = await import('h3');
    (getQuery as any).mockReturnValue({ granularity: 'week' });

    const result = await handler(testEvent);

    expect(result.data).toHaveProperty('trend');
    expect(result.data.trend).toHaveLength(4);
  });

  it('returns drill-down data when period parameter is provided', async () => {
    const { getQuery } = await import('h3');
    (getQuery as any).mockReturnValue({ period: '2026-W01' });

    const result = await handler(testEvent);

    expect(result.data).toHaveProperty('drillDown');
    expect(result.data).toHaveProperty('period', '2026-W01');
  });

  it('returns empty drill-down for invalid granularity', async () => {
    const { getQuery } = await import('h3');
    (getQuery as any).mockReturnValue({
      granularity: 'day',
      period: '2026-01',
    });

    const result = await handler(testEvent);

    expect(result.data.drillDown).toEqual([]);
  });

  it('uses issue source when source query is "issue"', async () => {
    const { getQuery } = await import('h3');
    (getQuery as any).mockReturnValue({ source: 'issue' });

    const result = await handler(testEvent);

    expect(result.data).toHaveProperty('trend');
  });

  it('defaults to inspection source for non-issue values', async () => {
    const { getQuery } = await import('h3');
    (getQuery as any).mockReturnValue({ source: 'something' });

    const result = await handler(testEvent);

    expect(result.data).toHaveProperty('trend');
  });

  it('returns error response on failure', async () => {
    const { createPassRateTargetResolver } = await import(
      '~/modules/report/pass-rate'
    );
    (createPassRateTargetResolver as any).mockRejectedValue(
      new Error('db error'),
    );

    const { getQuery } = await import('h3');
    (getQuery as any).mockReturnValue({});

    const result = await handler(testEvent);

    expect(result).toEqual(expect.objectContaining({ _error: true }));
  });

  it('trend data entries have period and passRate fields', async () => {
    const { createPassRateTargetResolver } = await import(
      '~/modules/report/pass-rate'
    );
    (createPassRateTargetResolver as any).mockResolvedValue(() => 95);
    const { getQuery } = await import('h3');
    (getQuery as any).mockReturnValue({ granularity: 'week' });

    const result = await handler(testEvent);

    for (const item of result.data.trend) {
      expect(item).toHaveProperty('period');
      expect(item).toHaveProperty('passRate');
      expect(item).toHaveProperty('totalCount');
      expect(item).toHaveProperty('passCount');
    }
  });
});
