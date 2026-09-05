import { describe, expect, it, vi } from 'vitest';
import handler from '~/modules/work-order/work-order-index.put.service';

type PutHandler = (
  event: never,
  body: Record<string, unknown>,
) => Promise<unknown>;
const putHandler = handler as unknown as PutHandler;

vi.mock('~/modules/work-order/work-order-route.service', () => ({
  WorkOrderRouteService: {
    update: vi.fn(),
  },
}));

vi.mock('~/utils/current-user', () => ({
  getCurrentUser: vi.fn(() => ({ id: 'user-1', username: 'admin' })),
}));

vi.mock('~/utils/define-validated-handler', () => ({
  defineValidatedHandler: (_schema: unknown, handler: unknown) => handler,
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

describe('work-order-index.put.service', () => {
  it('rejects an edit without a version (400) and never calls the service', async () => {
    const { WorkOrderRouteService } = await import(
      '~/modules/work-order/work-order-route.service'
    );

    const result = await putHandler({ context: {} } as never, {
      customerName: 'No version',
    });

    expect(result).toEqual(
      expect.objectContaining({ error: true, statusCode: 400 }),
    );
    expect(WorkOrderRouteService.update).not.toHaveBeenCalled();
  });

  it('forwards the client version to the scoped versioned update', async () => {
    const { WorkOrderRouteService } = await import(
      '~/modules/work-order/work-order-route.service'
    );

    vi.mocked(WorkOrderRouteService.update).mockResolvedValue(null as never);
    const event = { context: { dataScope: { scopeType: 'ALL' } } } as any;
    const result = await putHandler(event as never, {
      customerName: 'Updated',
      version: 1,
    });

    expect(WorkOrderRouteService.update).toHaveBeenCalledWith(
      event,
      'WO-001',
      { customerName: 'Updated', version: 1 },
      { id: 'user-1', username: 'admin' },
      1,
    );
    expect(result).toEqual({ data: null, success: true });
  });
});
