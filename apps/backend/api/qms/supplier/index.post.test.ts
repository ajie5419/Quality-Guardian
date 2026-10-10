import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authorizeWriteAnyOf } from '~/modules/rbac';
import { BusinessError, businessErrorResponse } from '~/utils/business-error';

import handler from './index.post';

vi.mock('h3', () => ({
  defineEventHandler: (fn: unknown) => fn,
  readBody: vi.fn(),
}));
vi.mock('~/modules/rbac', () => ({
  authorizeWriteAnyOf: vi.fn(),
}));
vi.mock('~/modules/supplier/supplier.service', () => ({
  SupplierService: {
    createSupplierWithOutcome: vi.fn(),
  },
}));
vi.mock('~/modules/system-log/audit-log', () => ({
  recordBusinessAuditLog: vi.fn(),
}));
vi.mock('~/utils/api-logger', () => ({
  logApiError: vi.fn(),
  logApiWarn: vi.fn(),
}));
vi.mock('~/utils/current-user', () => ({ getCurrentUser: vi.fn() }));
vi.mock('~/utils/business-error', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('~/utils/business-error')>();
  return {
    ...actual,
    businessErrorResponse: vi.fn(() => ({ code: -1 })),
  };
});

describe('supplier post authorization boundary', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns a standard 403 response when create authorization fails', async () => {
    const error = new BusinessError('FORBIDDEN', 'Denied', 403);
    vi.mocked(authorizeWriteAnyOf).mockRejectedValueOnce(error);
    const event = {} as never;
    const result = await handler(event as never);
    expect(result).toEqual({ code: -1 });
    expect(businessErrorResponse).toHaveBeenCalledWith(event, error);
  });
});
