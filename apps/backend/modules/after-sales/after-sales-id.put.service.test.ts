import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('h3', () => ({
  defineEventHandler: (fn: any) => fn,
  readBody: vi.fn(),
  setResponseStatus: vi.fn(),
}));

vi.mock('~/utils/prisma', () => {
  const afterSales = {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  };
  return {
    default: {
      after_sales: afterSales,
      $transaction: vi.fn((callback) =>
        callback({
          after_sales: afterSales,
          quality_loss_index_jobs: {
            createMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
        }),
      ),
    },
  };
});

vi.mock('~/modules/after-sales/after-sales-payload', () => ({
  buildGovernedAfterSalesUpdateData: vi.fn(
    async (body: Record<string, unknown>) => ({
      costsChanged: Boolean(body.materialCost || body.laborTravelCost),
      data: body,
    }),
  ),
}));

vi.mock('~/modules/file-storage/file-storage.service', () => ({
  FileStorageService: {
    registerReferencesFromAttachments: vi.fn(),
  },
}));

vi.mock('~/modules/system-log/system-log.service', () => ({
  SystemLogService: {
    auditLog: vi.fn(),
  },
}));

vi.mock('~/utils/current-user', () => ({
  getCurrentUser: vi.fn(() => ({
    id: 'user-1',
    userId: 'user-1',
    username: 'admin',
  })),
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
  legacyErrorToBusinessError: vi.fn().mockReturnValue(null),
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

vi.mock('~/modules/metric-refresh', () => ({
  MetricRefreshQueue: {
    enqueueSupplierScores: vi.fn(),
  },
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

describe('after-sales-id.put.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should update after-sales record successfully', async () => {
    const { readBody } = await import('h3');
    const { default: handler } = await import(
      '~/modules/after-sales/after-sales-id.put.service'
    );
    const prismaModule = await import('~/utils/prisma');
    const prisma = prismaModule.default;

    vi.mocked(readBody).mockResolvedValue({
      projectName: 'Updated',
      version: 1,
    });
    (prisma.after_sales.findFirst as any).mockResolvedValue({
      id: 'test-id',
      supplierBrandId: 'supplier-1',
      version: 1,
    });
    (prisma.after_sales.updateMany as any).mockResolvedValue({ count: 1 });

    const result = await handler({ context: {} } as any);

    expect(result).toEqual({ data: null, success: true });
    expect(prisma.after_sales.updateMany).toHaveBeenCalledWith({
      where: { id: 'test-id', version: 1 },
      data: { projectName: 'Updated', version: { increment: 1 } },
    });
  });

  it('writes cost fields verbatim and lets DB compute qualityLoss elsewhere', async () => {
    const { readBody } = await import('h3');
    const { default: handler } = await import(
      '~/modules/after-sales/after-sales-id.put.service'
    );
    const prismaModule = await import('~/utils/prisma');
    const prisma = prismaModule.default;

    vi.mocked(readBody).mockResolvedValue({ materialCost: 100, version: 1 });
    (prisma.after_sales.findFirst as any).mockResolvedValue({
      laborTravelCost: 50,
      materialCost: 30,
      version: 1,
    });
    (prisma.after_sales.updateMany as any).mockResolvedValue({ count: 1 });

    await handler({ context: {} } as any);

    expect(prisma.after_sales.updateMany).toHaveBeenCalledWith({
      where: { id: 'test-id', version: 1 },
      data: expect.objectContaining({
        materialCost: 100,
      }),
    });
    const callArgs = (prisma.after_sales.updateMany as any).mock.calls[0][0];
    expect(callArgs.data).not.toHaveProperty('qualityLoss');
  });

  it('refreshes both supplier snapshots for an ID-only reassignment', async () => {
    const { readBody } = await import('h3');
    const { default: handler } = await import(
      '~/modules/after-sales/after-sales-id.put.service'
    );
    const { buildGovernedAfterSalesUpdateData } = await import(
      '~/modules/after-sales/after-sales-payload'
    );
    const { MetricRefreshQueue } = await import('~/modules/metric-refresh');
    const prismaModule = await import('~/utils/prisma');
    const prisma = prismaModule.default;

    vi.mocked(readBody).mockResolvedValue({
      supplierBrandId: 'supplier-2',
      version: 1,
    });
    vi.mocked(buildGovernedAfterSalesUpdateData).mockResolvedValueOnce({
      costsChanged: false,
      data: { supplierBrandId: 'supplier-2' },
    });
    vi.mocked(prisma.after_sales.findFirst).mockResolvedValue({
      supplierBrand: 'Supplier A',
      supplierBrandId: 'supplier-1',
      version: 1,
    } as never);
    vi.mocked(prisma.after_sales.updateMany).mockResolvedValue({
      count: 1,
    } as never);

    await handler({ context: {} } as any);

    expect(MetricRefreshQueue.enqueueSupplierScores).toHaveBeenCalledWith(
      expect.any(Object),
      ['supplier-1', 'supplier-2'],
      'after-sales.updated',
    );
  });

  it('should return not found when record does not exist during cost recalculation', async () => {
    const { readBody } = await import('h3');
    const { default: handler } = await import(
      '~/modules/after-sales/after-sales-id.put.service'
    );
    const prismaModule = await import('~/utils/prisma');
    const prisma = prismaModule.default;

    vi.mocked(readBody).mockResolvedValue({ materialCost: 100, version: 1 });
    (prisma.after_sales.findFirst as any).mockResolvedValue(null);

    const result = await handler({ context: {} } as any);

    expect(result).toEqual(expect.objectContaining({ error: true }));
  });

  it('should register file references when photos are provided', async () => {
    const { readBody } = await import('h3');
    const { default: handler } = await import(
      '~/modules/after-sales/after-sales-id.put.service'
    );
    const { FileStorageService } = await import(
      '~/modules/file-storage/file-storage.service'
    );
    const prismaModule = await import('~/utils/prisma');
    const prisma = prismaModule.default;

    vi.mocked(readBody).mockResolvedValue({
      photos: [{ url: 'https://oss.example.com/photo.jpg' }],
      version: 1,
    });
    (prisma.after_sales.findFirst as any).mockResolvedValue({
      id: 'test-id',
      supplierBrandId: 'supplier-1',
      version: 1,
    });
    (prisma.after_sales.updateMany as any).mockResolvedValue({ count: 1 });

    await handler({ context: {} } as any);

    expect(
      FileStorageService.registerReferencesFromAttachments,
    ).toHaveBeenCalledWith({
      attachments: [{ url: 'https://oss.example.com/photo.jpg' }],
      bizId: 'test-id',
      bizType: 'after_sales',
      fieldName: 'photos',
    });
  });

  it('should return internal error when update fails', async () => {
    const { readBody } = await import('h3');
    const { default: handler } = await import(
      '~/modules/after-sales/after-sales-id.put.service'
    );
    const prismaModule = await import('~/utils/prisma');
    const prisma = prismaModule.default;

    vi.mocked(readBody).mockResolvedValue({ projectName: 'Test', version: 1 });
    (prisma.after_sales.findFirst as any).mockResolvedValue({
      id: 'test-id',
      version: 1,
    });
    (prisma.after_sales.updateMany as any).mockRejectedValue(
      new Error('db error'),
    );

    const result = await handler({} as any);

    expect(result).toEqual({
      error: true,
      message: '更新售后记录失败',
    });
  });

  it('should return not found when prisma throws not found error', async () => {
    const { readBody } = await import('h3');
    const { default: handler } = await import(
      '~/modules/after-sales/after-sales-id.put.service'
    );
    const prismaModule = await import('~/utils/prisma');
    const prisma = prismaModule.default;

    vi.mocked(readBody).mockResolvedValue({ projectName: 'Test', version: 1 });
    (prisma.after_sales.findFirst as any).mockResolvedValue({
      id: 'test-id',
      version: 1,
    });
    (prisma.after_sales.updateMany as any).mockRejectedValue(
      new Error('not found'),
    );

    const result = await handler({} as any);

    expect(result).toEqual(expect.objectContaining({ error: true }));
  });

  it('rejects an interactive edit without a version (400, no write attempted)', async () => {
    const { readBody } = await import('h3');
    const { default: handler } = await import(
      '~/modules/after-sales/after-sales-id.put.service'
    );
    const prismaModule = await import('~/utils/prisma');
    const prisma = prismaModule.default;

    vi.mocked(readBody).mockResolvedValue({ projectName: 'No version' });

    const result = await handler({ context: {} } as any);

    expect(result).toEqual(
      expect.objectContaining({ error: true, statusCode: 400 }),
    );
    expect(prisma.after_sales.updateMany).not.toHaveBeenCalled();
  });

  it('returns 409 when the stored version is newer than the submitted one', async () => {
    const { readBody } = await import('h3');
    const { default: handler } = await import(
      '~/modules/after-sales/after-sales-id.put.service'
    );
    const prismaModule = await import('~/utils/prisma');
    const prisma = prismaModule.default;

    vi.mocked(readBody).mockResolvedValue({ projectName: 'Stale', version: 1 });
    // Two users both read version=1; the other user already committed v2.
    (prisma.after_sales.findFirst as any).mockResolvedValue({
      id: 'test-id',
      supplierBrandId: 'supplier-1',
      version: 2,
    });
    (prisma.after_sales.updateMany as any).mockResolvedValue({ count: 0 });

    const result = await handler({ context: {} } as any);

    expect(result).toEqual(
      expect.objectContaining({ error: true, statusCode: 409 }),
    );
    expect(prisma.after_sales.updateMany).toHaveBeenCalledTimes(1);
  });
});
