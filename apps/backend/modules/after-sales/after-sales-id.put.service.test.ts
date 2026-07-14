import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('h3', () => ({
  defineEventHandler: (fn: any) => fn,
  readBody: vi.fn(),
}));

vi.mock('~/utils/prisma', () => ({
  default: {
    after_sales: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
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

vi.mock('~/utils/event-bus', () => ({
  eventBus: { emit: vi.fn() },
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

    vi.mocked(readBody).mockResolvedValue({ projectName: 'Updated' });
    (prisma.after_sales.update as any).mockResolvedValue({});

    const result = await handler({} as any);

    expect(result).toEqual({ data: null, success: true });
    expect(prisma.after_sales.update).toHaveBeenCalledWith({
      where: { id: 'test-id' },
      data: { projectName: 'Updated' },
    });
  });

  it('writes cost fields verbatim and lets DB compute qualityLoss elsewhere', async () => {
    const { readBody } = await import('h3');
    const { default: handler } = await import(
      '~/modules/after-sales/after-sales-id.put.service'
    );
    const prismaModule = await import('~/utils/prisma');
    const prisma = prismaModule.default;

    vi.mocked(readBody).mockResolvedValue({ materialCost: 100 });
    (prisma.after_sales.findUnique as any).mockResolvedValue({
      laborTravelCost: 50,
      materialCost: 30,
    });
    (prisma.after_sales.update as any).mockResolvedValue({});

    await handler({} as any);

    expect(prisma.after_sales.update).toHaveBeenCalledWith({
      where: { id: 'test-id' },
      data: expect.objectContaining({
        materialCost: 100,
      }),
    });
    const callArgs = (prisma.after_sales.update as any).mock.calls[0][0];
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
    const { eventBus } = await import('~/utils/event-bus');
    const prismaModule = await import('~/utils/prisma');
    const prisma = prismaModule.default;

    vi.mocked(readBody).mockResolvedValue({ supplierBrandId: 'supplier-2' });
    vi.mocked(buildGovernedAfterSalesUpdateData).mockResolvedValueOnce({
      costsChanged: false,
      data: { supplierBrandId: 'supplier-2' },
    });
    vi.mocked(prisma.after_sales.findUnique).mockResolvedValue({
      supplierBrand: 'Supplier A',
      supplierBrandId: 'supplier-1',
    } as never);
    vi.mocked(prisma.after_sales.update).mockResolvedValue({
      supplierBrand: 'Supplier B',
      supplierBrandId: 'supplier-2',
    } as never);

    await handler({} as any);

    expect(eventBus.emit).toHaveBeenCalledWith('after_sales.changed', {
      supplierBrands: ['Supplier A', 'Supplier B'],
      supplierIds: ['supplier-1', 'supplier-2'],
    });
  });

  it('should return not found when record does not exist during cost recalculation', async () => {
    const { readBody } = await import('h3');
    const { default: handler } = await import(
      '~/modules/after-sales/after-sales-id.put.service'
    );
    const prismaModule = await import('~/utils/prisma');
    const prisma = prismaModule.default;

    vi.mocked(readBody).mockResolvedValue({ materialCost: 100 });
    (prisma.after_sales.findUnique as any).mockResolvedValue(null);

    const result = await handler({} as any);

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
    });
    (prisma.after_sales.update as any).mockResolvedValue({});

    await handler({} as any);

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

    vi.mocked(readBody).mockResolvedValue({ projectName: 'Test' });
    (prisma.after_sales.update as any).mockRejectedValue(new Error('db error'));

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

    vi.mocked(readBody).mockResolvedValue({ projectName: 'Test' });
    (prisma.after_sales.update as any).mockRejectedValue(
      new Error('not found'),
    );

    const result = await handler({} as any);

    expect(result).toEqual(expect.objectContaining({ error: true }));
  });
});
