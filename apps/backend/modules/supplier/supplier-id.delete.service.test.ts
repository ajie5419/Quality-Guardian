import { describe, expect, it, vi } from 'vitest';

vi.mock('h3', () => ({
  defineEventHandler: (fn: any) => fn,
  getQuery: vi.fn(),
}));

vi.mock('~/modules/supplier/supplier.service', () => ({
  SupplierService: {
    deleteSupplier: vi.fn(),
  },
}));

vi.mock('~/modules/system-log', () => ({
  recordBusinessAuditLog: vi.fn(),
  SystemLogService: {
    auditLog: vi.fn(),
  },
}));

vi.mock('~/utils/current-user', () => ({
  getCurrentUser: vi.fn(() => ({ id: 'user-1', username: 'admin' })),
}));

vi.mock('~/utils/route-param', () => ({
  getRequiredRouterParam: vi.fn(() => 'supplier-1'),
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

describe('supplier-id.delete.service', () => {
  it('rejects a delete without a version (400) and never calls the service', async () => {
    const { getQuery } = await import('h3');
    const { SupplierService } = await import(
      '~/modules/supplier/supplier.service'
    );
    const { default: handler } = await import(
      '~/modules/supplier/supplier-id.delete.service'
    );

    vi.mocked(getQuery).mockReturnValue({});
    const result = await handler({ context: {} } as any);

    expect(result).toEqual(
      expect.objectContaining({ error: true, statusCode: 400 }),
    );
    expect(SupplierService.deleteSupplier).not.toHaveBeenCalled();
  });

  it('forwards the client version to the scoped versioned delete and audits', async () => {
    const { getQuery } = await import('h3');
    const { SupplierService } = await import(
      '~/modules/supplier/supplier.service'
    );
    const { recordBusinessAuditLog } = await import('~/modules/system-log');
    const { default: handler } = await import(
      '~/modules/supplier/supplier-id.delete.service'
    );

    vi.mocked(getQuery).mockReturnValue({ version: '3' });
    vi.mocked(SupplierService.deleteSupplier).mockResolvedValue({
      id: 'supplier-1',
      name: 'Supplier A',
    } as never);
    const event = { context: { dataScope: { scopeType: 'DEPT' } } } as any;
    const result = await handler(event);

    expect(SupplierService.deleteSupplier).toHaveBeenCalledWith(
      'supplier-1',
      3,
      {
        scope: { scopeType: 'DEPT' },
        user: { id: 'user-1', username: 'admin' },
      },
    );
    expect(recordBusinessAuditLog).toHaveBeenCalledWith(event, {
      userId: 'user-1',
      action: 'DELETE',
      targetType: 'supplier',
      targetId: 'supplier-1',
      detailsTemplate: '删除供应商/外协单位: {{name}}',
      detailsVariables: { name: 'Supplier A' },
    });
    expect(result).toEqual({ data: null, success: true });
  });
});
