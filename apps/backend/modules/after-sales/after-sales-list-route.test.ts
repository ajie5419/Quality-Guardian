import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('h3', () => ({
  defineEventHandler: (handler: unknown) => handler,
  getMethod: (event: { method?: string }) => event.method || 'GET',
  getQuery: (event: { query?: unknown }) => event.query || {},
  readBody: (event: { body?: unknown }) => Promise.resolve(event.body || {}),
  setResponseStatus: vi.fn(),
}));

vi.mock('~/modules/after-sales/after-sales.service', () => ({
  AfterSalesService: {
    getList: vi.fn(),
  },
}));

vi.mock('~/utils/api-logger', () => ({
  logApiError: vi.fn(),
}));

describe('after-sales list route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the requested page instead of the full list', async () => {
    const { default: handler } = await import(
      '~/api/qms/after-sales/index.get'
    );
    const { AfterSalesService } = await import(
      '~/modules/after-sales/after-sales.service'
    );

    vi.mocked(AfterSalesService.getList).mockResolvedValue([
      { id: 'AS-1' },
      { id: 'AS-2' },
      { id: 'AS-3' },
      { id: 'AS-4' },
      { id: 'AS-5' },
    ] as never);

    const response = (await handler({
      context: {
        dataScope: undefined,
        user: { id: 'u1', username: 'tester' },
      },
      method: 'GET',
      query: { page: '2', pageSize: '2', year: '2026' },
    } as never)) as { data: { items: Array<{ id: string }>; total: number } };

    expect(response.data.items).toEqual([{ id: 'AS-3' }, { id: 'AS-4' }]);
    expect(response.data.total).toBe(5);
  });
});
