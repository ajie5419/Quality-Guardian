import { readBody } from 'h3';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import handler from '~/modules/supplier/supplier-import.post.service';
import { SupplierService } from '~/modules/supplier/supplier.service';
import { recordBusinessAuditLog } from '~/modules/system-log/audit-log';
import { getCurrentUser } from '~/utils/current-user';
import { parseNonEmptyArray } from '~/utils/request-validation';
import {
  badRequestResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

vi.mock('h3', () => ({
  defineEventHandler: (fn: any) => fn,
  readBody: vi.fn(),
}));

vi.mock('~/modules/supplier/supplier.service', () => ({
  SupplierService: {
    importSuppliers: vi.fn(),
  },
}));

vi.mock('~/modules/system-log/audit-log', () => ({
  recordBusinessAuditLog: vi.fn(),
}));

vi.mock('~/utils/api-logger', () => ({
  logApiError: vi.fn(),
}));

vi.mock('~/utils/current-user', () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock('~/utils/request-validation', () => ({
  parseNonEmptyArray: vi.fn(),
}));

vi.mock('~/utils/response', () => ({
  badRequestResponse: vi.fn(),
  internalServerErrorResponse: vi.fn(),
  useResponseSuccess: vi.fn(),
}));

function mockEvent() {
  return { context: { user: { id: 'user-1', username: 'admin' } } } as any;
}

describe('supplierImportPostService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getCurrentUser as any).mockReturnValue({
      id: 'user-1',
      username: 'admin',
    });
  });

  it('should import suppliers successfully', async () => {
    (readBody as any).mockResolvedValue({
      category: 'Supplier',
      items: [{ name: 'S1' }],
    });
    (parseNonEmptyArray as any).mockReturnValue([{ name: 'S1' }]);
    (SupplierService.importSuppliers as any).mockResolvedValue({
      successCount: 1,
      totalCount: 1,
    });
    (useResponseSuccess as any).mockReturnValue({ code: 0 });

    const event = mockEvent();
    const _result = await handler(event);

    expect(SupplierService.importSuppliers).toHaveBeenCalledWith(
      [{ name: 'S1' }],
      'Supplier',
    );
    expect(recordBusinessAuditLog).toHaveBeenCalledWith(event, {
      userId: 'user-1',
      action: 'CREATE',
      targetType: 'supplier',
      targetId: 'batch-import',
      detailsTemplate:
        '导入供应商/外协单位: {{successCount}}/{{totalCount}} 条',
      detailsVariables: { successCount: 1, totalCount: 1 },
    });
    expect(useResponseSuccess).toHaveBeenCalledWith({
      successCount: 1,
      totalCount: 1,
    });
  });

  it('should return badRequestResponse when items is empty', async () => {
    (readBody as any).mockResolvedValue({ items: [] });
    (parseNonEmptyArray as any).mockReturnValue(null);
    (badRequestResponse as any).mockReturnValue({ code: 1 });

    const event = mockEvent();
    const _result = await handler(event);

    expect(badRequestResponse).toHaveBeenCalledWith(event, '未选择数据');
    expect(SupplierService.importSuppliers).not.toHaveBeenCalled();
  });

  it('should return internalServerErrorResponse on error', async () => {
    (readBody as any).mockResolvedValue({ items: [{ name: 'S1' }] });
    (parseNonEmptyArray as any).mockReturnValue([{ name: 'S1' }]);
    (SupplierService.importSuppliers as any).mockRejectedValue(
      new Error('import error'),
    );
    (internalServerErrorResponse as any).mockReturnValue({ code: 1 });

    const event = mockEvent();
    const _result = await handler(event);

    expect(internalServerErrorResponse).toHaveBeenCalledWith(event, '导入异常');
  });

  it('should handle missing category gracefully', async () => {
    (readBody as any).mockResolvedValue({ items: [{ name: 'S1' }] });
    (parseNonEmptyArray as any).mockReturnValue([{ name: 'S1' }]);
    (SupplierService.importSuppliers as any).mockResolvedValue({
      successCount: 1,
      totalCount: 1,
    });
    (useResponseSuccess as any).mockReturnValue({ code: 0 });

    await handler(mockEvent());

    expect(SupplierService.importSuppliers).toHaveBeenCalledWith(
      [{ name: 'S1' }],
      undefined,
    );
  });

  it('should import with multiple items and report counts', async () => {
    (readBody as any).mockResolvedValue({
      category: 'Outsourcing',
      items: [{ name: 'S1' }, { name: 'S2' }, { name: 'S3' }],
    });
    (parseNonEmptyArray as any).mockReturnValue([
      { name: 'S1' },
      { name: 'S2' },
      { name: 'S3' },
    ]);
    (SupplierService.importSuppliers as any).mockResolvedValue({
      successCount: 2,
      totalCount: 3,
    });
    (useResponseSuccess as any).mockReturnValue({ code: 0 });

    await handler(mockEvent());

    expect(recordBusinessAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        detailsVariables: { successCount: 2, totalCount: 3 },
      }),
    );
  });
});
