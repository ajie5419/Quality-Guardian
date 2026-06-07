import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AfterSalesRouteService } from '~/modules/after-sales/after-sales-route.service';
import prisma from '~/utils/prisma';

const {
  badRequestResponse,
  defineValidatedHandler,
  getCurrentUser,
  getRequiredRouterParam,
  internalServerErrorResponse,
  isPrismaNotFoundError,
  logApiError,
  notFoundResponse,
  readBody,
  registerReferencesFromAttachments,
  softDeleteReferences,
  auditLog,
  useResponseSuccess,
  buildGovernedAfterSalesCreateData,
  buildGovernedAfterSalesUpdateData,
  parseRequiredWorkOrderNumber,
  getNextAfterSalesSerialNumber,
  createAfterSalesId,
  getChartAggregation,
} = vi.hoisted(() => ({
  auditLog: vi.fn(),
  badRequestResponse: vi.fn((_event, message) => ({ message, type: 'bad' })),
  buildGovernedAfterSalesCreateData: vi.fn(async (_body, options) => ({
    id: options.id,
    projectName: 'Project A',
    serialNumber: options.serialNumber,
    workOrderNumber: options.defaultWorkOrderNumber,
  })),
  buildGovernedAfterSalesUpdateData: vi.fn(async (body) => ({
    costsChanged: Boolean(body.materialCost || body.laborTravelCost),
    data: body,
  })),
  createAfterSalesId: vi.fn(() => 'AS-2026-0001'),
  defineValidatedHandler: vi.fn((_schema, handler) => handler),
  getChartAggregation: vi.fn(),
  getCurrentUser: vi.fn(),
  getNextAfterSalesSerialNumber: vi.fn(),
  getRequiredRouterParam: vi.fn(),
  internalServerErrorResponse: vi.fn((_event, message) => ({
    message,
    type: 'internal',
  })),
  isPrismaNotFoundError: vi.fn(),
  logApiError: vi.fn(),
  notFoundResponse: vi.fn((_event, message) => ({
    message,
    type: 'not_found',
  })),
  parseRequiredWorkOrderNumber: vi.fn(),
  readBody: vi.fn(),
  registerReferencesFromAttachments: vi.fn(),
  softDeleteReferences: vi.fn(),
  useResponseSuccess: vi.fn((data) => ({ data, type: 'success' })),
}));

vi.mock('~/utils/prisma', () => ({
  default: {
    after_sales: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock('h3', () => ({
  defineEventHandler: (handler: unknown) => handler,
  readBody,
}));

vi.mock('~/utils/current-user', () => ({
  getCurrentUser,
}));

vi.mock('~/utils/route-param', () => ({
  getRequiredRouterParam,
}));

vi.mock('~/utils/api-logger', () => ({
  logApiError,
}));

vi.mock('~/utils/prisma-error', () => ({
  isPrismaNotFoundError,
}));

vi.mock('~/utils/response', () => ({
  badRequestResponse,
  internalServerErrorResponse,
  notFoundResponse,
  useResponseSuccess,
}));

vi.mock('~/modules/file-storage/file-storage.service', () => ({
  FileStorageService: {
    registerReferencesFromAttachments,
    softDeleteReferences,
  },
}));

vi.mock('~/modules/system-log/system-log.service', () => ({
  SystemLogService: {
    auditLog,
  },
}));

vi.mock('~/modules/work-order/work-order-query', () => ({
  parseRequiredWorkOrderNumber,
}));

vi.mock('~/modules/after-sales/after-sales-id', () => ({
  createAfterSalesId,
  getNextAfterSalesSerialNumber,
}));

vi.mock('~/modules/after-sales/after-sales-payload', () => ({
  buildGovernedAfterSalesCreateData,
  buildGovernedAfterSalesUpdateData,
}));

vi.mock('~/utils/define-validated-handler', () => ({
  defineValidatedHandler,
}));

vi.mock('~/modules/after-sales/after-sales.service', () => ({
  AfterSalesService: {
    getChartAggregation,
  },
}));

function event() {
  return { context: { dataScope: { mode: 'ALL' } } } as any;
}

describe('after-sales route services', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUser.mockReturnValue({ id: 'u-1', username: 'admin' });
    getRequiredRouterParam.mockReturnValue('as-1');
    getNextAfterSalesSerialNumber.mockResolvedValue(10);
    parseRequiredWorkOrderNumber.mockImplementation((value) =>
      String(value || '').trim(),
    );
  });

  it('batch deletes records and soft deletes file references', async () => {
    vi.mocked(prisma.after_sales.updateMany).mockResolvedValue({
      count: 2,
    } as never);

    await expect(
      AfterSalesRouteService.batchDelete(['as-1', 'as-2']),
    ).resolves.toBe(2);
    expect(softDeleteReferences).toHaveBeenCalledTimes(2);
  });

  it('creates after-sales records with generated id, governed data, attachments, and audit log', async () => {
    vi.mocked(prisma.after_sales.create).mockResolvedValue({
      id: 'AS-2026-0001',
      projectName: 'Project A',
    } as never);

    const result = await AfterSalesRouteService.create(
      { photos: ['/a.png'], workOrderNumber: 'WO-1' },
      { id: 'u-1' },
    );

    expect(result).toEqual({ id: 'AS-2026-0001', projectName: 'Project A' });
    expect(buildGovernedAfterSalesCreateData).toHaveBeenCalledWith(
      { photos: ['/a.png'], workOrderNumber: 'WO-1' },
      expect.objectContaining({
        id: 'AS-2026-0001',
        serialNumber: 10,
      }),
    );
    expect(registerReferencesFromAttachments).toHaveBeenCalledWith({
      attachments: ['/a.png'],
      bizId: 'AS-2026-0001',
      bizType: 'after_sales',
      fieldName: 'photos',
    });
    expect(auditLog).toHaveBeenCalledWith(
      'after-sales',
      'create',
      expect.objectContaining({ targetId: 'AS-2026-0001' }),
    );
  });

  it('imports rows with row-level errors and serial sequence', async () => {
    vi.mocked(prisma.after_sales.create)
      .mockResolvedValueOnce({ id: 'as-1' } as never)
      .mockRejectedValueOnce(new Error('bad supplier'));

    const result = await AfterSalesRouteService.importItems([
      { workOrderNumber: '' },
      { workOrderNumber: 'WO-1' },
      { workOrderNumber: 'WO-2' },
    ]);

    expect(result).toEqual(
      expect.objectContaining({
        errorCount: 2,
        errors: expect.any(Array),
        successCount: 1,
        totalCount: 3,
      }),
    );
    expect(buildGovernedAfterSalesCreateData).toHaveBeenCalledWith(
      { workOrderNumber: 'WO-1' },
      expect.objectContaining({ serialNumber: 10 }),
    );
    expect(buildGovernedAfterSalesCreateData).toHaveBeenCalledWith(
      { workOrderNumber: 'WO-2' },
      expect.objectContaining({ serialNumber: 11 }),
    );
  });

  it('updates after-sales route records with quality-loss recalculation and photo references', async () => {
    const mod = await import('~/modules/after-sales/after-sales-id.put.service');
    const handler = mod.default;
    readBody.mockResolvedValue({
      laborTravelCost: 20,
      materialCost: 80,
      photos: ['/new.png'],
    });
    vi.mocked(prisma.after_sales.findUnique).mockResolvedValue({
      laborTravelCost: 1,
      materialCost: 2,
    } as never);
    vi.mocked(prisma.after_sales.update).mockResolvedValue({} as never);

    expect(await handler(event())).toEqual({ data: null, type: 'success' });
    expect(prisma.after_sales.update).toHaveBeenCalledWith({
      where: { id: 'as-1' },
      data: expect.objectContaining({ qualityLoss: 100 }),
    });
    expect(registerReferencesFromAttachments).toHaveBeenCalledWith({
      attachments: ['/new.png'],
      bizId: 'as-1',
      bizType: 'after_sales',
      fieldName: 'photos',
    });
  });

  it('maps after-sales update missing id, missing current record, prisma not-found, and generic failures', async () => {
    const mod = await import('~/modules/after-sales/after-sales-id.put.service');
    const handler = mod.default;
    getRequiredRouterParam.mockReturnValueOnce({ message: 'missing id' });
    expect(await handler(event())).toEqual({ message: 'missing id' });

    getRequiredRouterParam.mockReturnValue('as-1');
    readBody.mockResolvedValue({ materialCost: 10 });
    vi.mocked(prisma.after_sales.findUnique).mockResolvedValueOnce(null);
    expect(await handler(event())).toEqual({
      message: '售后记录不存在',
      type: 'not_found',
    });

    vi.mocked(prisma.after_sales.findUnique).mockResolvedValueOnce({
      laborTravelCost: 0,
      materialCost: 0,
    } as never);
    vi.mocked(prisma.after_sales.update).mockRejectedValueOnce(
      new Error('not found') as never,
    );
    isPrismaNotFoundError.mockReturnValueOnce(true);
    expect(await handler(event())).toEqual({
      message: '售后记录不存在',
      type: 'not_found',
    });

    vi.mocked(prisma.after_sales.findUnique).mockResolvedValueOnce({
      laborTravelCost: 0,
      materialCost: 0,
    } as never);
    vi.mocked(prisma.after_sales.update).mockRejectedValueOnce(
      new Error('db') as never,
    );
    expect(await handler(event())).toEqual({
      message: '更新售后记录失败',
      type: 'internal',
    });
  });

  it('returns chart aggregation route data and maps failures', async () => {
    const mod = await import(
      '~/modules/after-sales/after-sales-chart-aggregate.get.service'
    );
    const handler = mod.default as any;
    getChartAggregation.mockResolvedValueOnce([{ name: 'A', value: 1 }]);
    expect(
      await handler(event(), {
        dimension: 'status',
        metric: 'count',
        top: 3,
        year: '2026',
      }),
    ).toEqual({ data: { items: [{ name: 'A', value: 1 }] }, type: 'success' });
    expect(getChartAggregation).toHaveBeenCalledWith(
      expect.objectContaining({
        dimension: 'status',
        metric: 'count',
        top: 3,
        year: 2026,
      }),
    );

    getChartAggregation.mockRejectedValueOnce(new Error('db'));
    expect(
      await handler(event(), {
        dimension: 'status',
        metric: 'count',
      }),
    ).toEqual({
      message: 'Failed to fetch after-sales chart aggregate',
      type: 'internal',
    });
  });
});
