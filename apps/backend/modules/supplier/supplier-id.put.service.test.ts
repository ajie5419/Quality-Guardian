import { readBody } from 'h3';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import handler from '~/modules/supplier/supplier-id.put.service';
import { SupplierService } from '~/modules/supplier/supplier.service';
import { recordBusinessAuditLog } from '~/modules/system-log/audit-log';
import { getCurrentUser } from '~/utils/current-user';
import {
  isPrismaNotFoundError,
  isPrismaUniqueConstraintError,
} from '~/utils/prisma-error';
import {
  conflictResponse,
  internalServerErrorResponse,
  notFoundResponse,
  useResponseSuccess,
} from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';

vi.mock('h3', () => ({
  defineEventHandler: (fn: any) => fn,
  readBody: vi.fn(),
}));

vi.mock('~/modules/supplier/supplier.service', () => ({
  SupplierService: {
    updateSupplier: vi.fn(),
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

vi.mock('~/utils/prisma-error', () => ({
  isPrismaNotFoundError: vi.fn(),
  isPrismaUniqueConstraintError: vi.fn(),
}));

vi.mock('~/utils/response', () => ({
  conflictResponse: vi.fn(),
  internalServerErrorResponse: vi.fn(),
  notFoundResponse: vi.fn(),
  useResponseSuccess: vi.fn(),
}));

vi.mock('~/utils/route-param', () => ({
  getRequiredRouterParam: vi.fn(),
}));

function mockEvent() {
  return { context: { user: { id: 'user-1', username: 'admin' } } } as any;
}

describe('supplierIdPutService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getCurrentUser as any).mockReturnValue({
      id: 'user-1',
      username: 'admin',
    });
  });

  it('should update supplier successfully', async () => {
    (getRequiredRouterParam as any).mockReturnValue('supplier-1');
    (readBody as any).mockResolvedValue({ name: 'Updated' });
    (SupplierService.updateSupplier as any).mockResolvedValue({
      id: 'supplier-1',
      name: 'Updated',
    });
    (useResponseSuccess as any).mockReturnValue({ code: 0 });

    const event = mockEvent();
    const _result = await handler(event);

    expect(SupplierService.updateSupplier).toHaveBeenCalledWith('supplier-1', {
      name: 'Updated',
    });
    expect(recordBusinessAuditLog).toHaveBeenCalledWith(event, {
      userId: 'user-1',
      action: 'UPDATE',
      targetType: 'supplier',
      targetId: 'supplier-1',
      detailsTemplate: '修改供应商/外协单位: {{name}}',
      detailsVariables: { name: 'Updated' },
    });
    expect(useResponseSuccess).toHaveBeenCalledWith(null);
  });

  it('should return notFoundResponse when supplier not found', async () => {
    (getRequiredRouterParam as any).mockReturnValue('missing');
    (readBody as any).mockResolvedValue({});
    (SupplierService.updateSupplier as any).mockRejectedValue(
      new Error('not found'),
    );
    (isPrismaNotFoundError as any).mockReturnValue(true);
    (notFoundResponse as any).mockReturnValue({ code: 1 });

    const event = mockEvent();
    const result = await handler(event);

    expect(notFoundResponse).toHaveBeenCalledWith(event, '供应商不存在');
    expect(result).toEqual({ code: 1 });
  });

  it('should return conflictResponse on unique constraint error', async () => {
    (getRequiredRouterParam as any).mockReturnValue('supplier-1');
    (readBody as any).mockResolvedValue({ name: 'Duplicate' });
    (SupplierService.updateSupplier as any).mockRejectedValue(
      new Error('duplicate'),
    );
    (isPrismaNotFoundError as any).mockReturnValue(false);
    (isPrismaUniqueConstraintError as any).mockReturnValue(true);
    (conflictResponse as any).mockReturnValue({ code: 1 });

    const event = mockEvent();
    const result = await handler(event);

    expect(conflictResponse).toHaveBeenCalledWith(event, '供应商名称已存在');
    expect(result).toEqual({ code: 1 });
  });

  it('should return internalServerErrorResponse on unknown error', async () => {
    (getRequiredRouterParam as any).mockReturnValue('supplier-1');
    (readBody as any).mockResolvedValue({});
    (SupplierService.updateSupplier as any).mockRejectedValue(
      new Error('unknown error'),
    );
    (isPrismaNotFoundError as any).mockReturnValue(false);
    (isPrismaUniqueConstraintError as any).mockReturnValue(false);
    (internalServerErrorResponse as any).mockReturnValue({ code: 1 });

    const event = mockEvent();
    const _result = await handler(event);

    expect(internalServerErrorResponse).toHaveBeenCalledWith(
      event,
      '更新供应商失败',
    );
  });

  it('should return error when id is not a string', async () => {
    (getRequiredRouterParam as any).mockReturnValue({ message: 'error' });

    const result = await handler(mockEvent());

    expect(result).toEqual({ message: 'error' });
    expect(SupplierService.updateSupplier).not.toHaveBeenCalled();
  });
});
