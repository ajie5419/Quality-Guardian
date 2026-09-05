import { describe, expect, it, vi } from 'vitest';

vi.mock('h3', () => ({
  defineEventHandler: (fn: any) => fn,
  getQuery: vi.fn(),
}));

vi.mock('~/modules/after-sales/after-sales.service', () => ({
  AfterSalesService: {
    deleteRecord: vi.fn(),
  },
}));

vi.mock('~/utils/current-user', () => ({
  getCurrentUser: vi.fn(() => ({ id: 'user-1', userId: 'user-1' })),
}));

vi.mock('~/utils/route-param', () => ({
  getRequiredRouterParam: vi.fn(() => 'as-1'),
}));

vi.mock('~/utils/business-error', () => ({
  BusinessError: class BusinessError extends Error {
    code: string;
    httpStatus: number;
    constructor(code: string, message?: string, httpStatus = 400) {
      super(message || code);
      this.name = 'BusinessError';
      this.code = code;
      this.httpStatus = httpStatus;
    }
  },
  isBusinessError: (error: unknown) =>
    error instanceof Error && error.name === 'BusinessError',
  businessErrorResponse: vi.fn((_event: any, err: any) => ({
    error: true,
    message: err.message,
    statusCode: err.httpStatus || 400,
  })),
}));

vi.mock('~/utils/api-logger', () => ({
  logApiError: vi.fn(),
}));

vi.mock('~/utils/prisma-error', () => ({
  isPrismaNotFoundError: vi.fn(() => false),
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
  useResponseSuccess: vi.fn((data: unknown) => ({ data, success: true })),
}));

describe('after-sales-id.delete.service', () => {
  it('rejects a delete without a version (400) and never calls the service', async () => {
    const { getQuery } = await import('h3');
    const { AfterSalesService } = await import(
      '~/modules/after-sales/after-sales.service'
    );
    const { default: handler } = await import(
      '~/modules/after-sales/after-sales-id.delete.service'
    );

    vi.mocked(getQuery).mockReturnValue({});
    const result = await handler({ context: {} } as any);

    expect(result).toEqual(
      expect.objectContaining({ error: true, statusCode: 400 }),
    );
    expect(AfterSalesService.deleteRecord).not.toHaveBeenCalled();
  });

  it('forwards the client version to the scoped versioned delete', async () => {
    const { getQuery } = await import('h3');
    const { AfterSalesService } = await import(
      '~/modules/after-sales/after-sales.service'
    );
    const { default: handler } = await import(
      '~/modules/after-sales/after-sales-id.delete.service'
    );

    vi.mocked(getQuery).mockReturnValue({ version: '2' });
    const result = await handler({
      context: { dataScope: { scopeType: 'ALL' } },
    } as any);

    expect(AfterSalesService.deleteRecord).toHaveBeenCalledWith(
      'as-1',
      'user-1',
      { scopeType: 'ALL' },
      2,
    );
    expect(result).toEqual({ data: null, success: true });
  });
});
