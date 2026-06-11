import { beforeEach, describe, expect, it, vi } from 'vitest';
import handler from '~/modules/supplier/supplier-export.get.service';
import { parseSupplierListQuery } from '~/modules/supplier/supplier-query';
import { SupplierService } from '~/modules/supplier/supplier.service';
import { logApiError, logApiWarn } from '~/utils/api-logger';
import {
  badRequestResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

vi.mock('~/utils/define-validated-handler', () => ({
  defineValidatedHandler: (_schema: any, handler: any) => (event: any) =>
    handler(event, (event as any).query),
}));

vi.mock('~/modules/supplier/supplier-query', () => ({
  parseSupplierListQuery: vi.fn(),
}));

vi.mock('~/modules/supplier/supplier.service', () => ({
  SupplierService: {
    findAll: vi.fn(),
  },
}));

vi.mock('~/utils/api-logger', () => ({
  logApiDebug: vi.fn(),
  logApiError: vi.fn(),
  logApiWarn: vi.fn(),
}));

vi.mock('~/utils/response', () => ({
  badRequestResponse: vi.fn(),
  internalServerErrorResponse: vi.fn(),
  useResponseSuccess: vi.fn(),
}));

function mockEvent(query: Record<string, unknown> = {}) {
  return { query } as any;
}

describe('supplierExportGetService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return items when total is within limit', async () => {
    (parseSupplierListQuery as any).mockReturnValue({ category: 'Supplier' });
    (SupplierService.findAll as any).mockResolvedValue({
      items: [{ id: '1', name: 'S1' }],
      total: 5,
    });
    (useResponseSuccess as any).mockReturnValue({ code: 0, message: 'ok' });

    const result = await handler(mockEvent());

    expect(useResponseSuccess).toHaveBeenCalledWith({
      items: [{ id: '1', name: 'S1' }],
      total: 5,
    });
    expect(result).toEqual({ code: 0, message: 'ok' });
  });

  it('should return badRequestResponse when total exceeds MAX_EXPORT_ROWS', async () => {
    (parseSupplierListQuery as any).mockReturnValue({ category: 'Supplier' });
    (SupplierService.findAll as any).mockResolvedValue({
      items: [],
      total: 20_001,
    });
    (badRequestResponse as any).mockReturnValue({ code: 1, message: 'limit' });

    const event = mockEvent();
    const result = await handler(event);

    expect(badRequestResponse).toHaveBeenCalledWith(
      event,
      expect.stringContaining('导出数据量超过上限'),
    );
    expect(result).toEqual({ code: 1, message: 'limit' });
    expect(logApiWarn).toHaveBeenCalled();
  });

  it('should pass page=1 and pageSize=20001 to findAll', async () => {
    (parseSupplierListQuery as any).mockReturnValue({
      category: 'Supplier',
      keyword: 'test',
    });
    (SupplierService.findAll as any).mockResolvedValue({ items: [], total: 0 });
    (useResponseSuccess as any).mockReturnValue({ code: 0 });

    await handler(mockEvent({ keyword: 'test' }));

    expect(SupplierService.findAll).toHaveBeenCalledWith({
      category: 'Supplier',
      keyword: 'test',
      page: 1,
      pageSize: 20_001,
    });
  });

  it('should return internalServerErrorResponse on error', async () => {
    (parseSupplierListQuery as any).mockReturnValue({});
    (SupplierService.findAll as any).mockRejectedValue(new Error('db error'));
    (internalServerErrorResponse as any).mockReturnValue({
      code: 1,
      message: 'error',
    });

    const event = mockEvent();
    const result = await handler(event);

    expect(logApiError).toHaveBeenCalled();
    expect(internalServerErrorResponse).toHaveBeenCalledWith(
      event,
      'Failed to export suppliers',
    );
    expect(result).toEqual({ code: 1, message: 'error' });
  });

  it('should return empty items when result.items is undefined', async () => {
    (parseSupplierListQuery as any).mockReturnValue({});
    (SupplierService.findAll as any).mockResolvedValue({});
    (useResponseSuccess as any).mockReturnValue({ code: 0 });

    await handler(mockEvent());

    expect(useResponseSuccess).toHaveBeenCalledWith({
      items: [],
      total: 0,
    });
  });

  it('should return empty items when result.total is undefined', async () => {
    (parseSupplierListQuery as any).mockReturnValue({});
    (SupplierService.findAll as any).mockResolvedValue({ items: [] });
    (useResponseSuccess as any).mockReturnValue({ code: 0 });

    await handler(mockEvent());

    expect(useResponseSuccess).toHaveBeenCalledWith({
      items: [],
      total: 0,
    });
  });
});
