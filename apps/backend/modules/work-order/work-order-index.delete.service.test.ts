import { describe, expect, it, vi } from 'vitest';

vi.mock('h3', () => ({
  defineEventHandler: (fn: any) => fn,
  getQuery: vi.fn(),
}));

vi.mock('~/modules/work-order/work-order-route.service', () => ({
  WorkOrderRouteService: {
    deleteById: vi.fn(),
  },
}));

vi.mock('~/utils/current-user', () => ({
  getCurrentUser: vi.fn(() => ({ id: 'user-1', username: 'admin' })),
}));

vi.mock('~/utils/query-param', () => ({
  getRequiredQueryParam: vi.fn(() => 'WO-001'),
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
  legacyErrorToBusinessError: vi.fn((error: unknown) =>
    error instanceof Error && error.name === 'BusinessError' ? error : null,
  ),
}));

vi.mock('~/utils/api-logger', () => ({
  logApiError: vi.fn(),
}));

vi.mock('~/utils/response', () => ({
  internalServerErrorResponse: vi.fn((_event: any, message: string) => ({
    error: true,
    message,
  })),
  useResponseSuccess: vi.fn((data: unknown) => ({ data, success: true })),
}));

describe('work-order-index.delete.service', () => {
  it('rejects a delete without a version (400) and never calls the service', async () => {
    const { getQuery } = await import('h3');
    const { WorkOrderRouteService } = await import(
      '~/modules/work-order/work-order-route.service'
    );
    const { default: handler } = await import(
      '~/modules/work-order/work-order-index.delete.service'
    );

    vi.mocked(getQuery).mockReturnValue({});
    const result = await handler({ context: {} } as any);

    expect(result).toEqual(
      expect.objectContaining({ error: true, statusCode: 400 }),
    );
    expect(WorkOrderRouteService.deleteById).not.toHaveBeenCalled();
  });

  it('forwards the client version to the scoped versioned delete', async () => {
    const { getQuery } = await import('h3');
    const { WorkOrderRouteService } = await import(
      '~/modules/work-order/work-order-route.service'
    );
    const { default: handler } = await import(
      '~/modules/work-order/work-order-index.delete.service'
    );

    vi.mocked(getQuery).mockReturnValue({ version: '2' });
    vi.mocked(WorkOrderRouteService.deleteById).mockResolvedValue(
      null as never,
    );
    const event = { context: { dataScope: { scopeType: 'DEPT' } } } as any;
    const result = await handler(event);

    expect(WorkOrderRouteService.deleteById).toHaveBeenCalledWith(
      event,
      'WO-001',
      { id: 'user-1', username: 'admin' },
      2,
    );
    expect(result).toEqual({ data: null, success: true });
  });
});
