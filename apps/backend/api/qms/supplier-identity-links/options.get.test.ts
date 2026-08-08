import { describe, expect, it, vi } from 'vitest';

import handler from './options.get';

const ensureAdmin = vi.hoisted(() => vi.fn());
const listManagementOptions = vi.hoisted(() => vi.fn());
type Query = { take: number };
type OptionsHandler = (event: never, query: Query) => Promise<unknown>;
const optionsHandler = handler as OptionsHandler;
vi.mock('~/modules/supplier-identity', () => ({
  SupplierIdentityAccessService: { ensureAdmin },
  supplierIdentityOptionsQuerySchema: {},
  SupplierIdentityService: { listManagementOptions },
}));
vi.mock('~/utils/api-logger', () => ({ logApiError: vi.fn() }));
vi.mock('~/utils/business-error', () => ({
  businessErrorResponse: (_event: unknown, error: unknown) => error,
  isBusinessError: () => true,
}));
vi.mock('~/utils/current-user', () => ({ getCurrentUser: vi.fn() }));
vi.mock('~/utils/define-validated-handler', () => ({
  defineValidatedHandler: (_schema: unknown, routeHandler: unknown) =>
    routeHandler,
}));
vi.mock('~/utils/response', () => ({
  internalServerErrorResponse: vi.fn(),
  useResponseSuccess: (data: unknown) => ({ data }),
}));
describe('get /qms/supplier-identity-links/options', () => {
  it('rejects non-admin users before listing options', async () => {
    const denied = { code: 'FORBIDDEN' };
    ensureAdmin.mockImplementation(() => {
      throw denied;
    });
    await expect(optionsHandler({} as never, { take: 100 })).resolves.toBe(
      denied,
    );
    expect(listManagementOptions).not.toHaveBeenCalled();
  });

  it('returns canonical options for system administrators', async () => {
    ensureAdmin.mockReset();
    const options = { suppliers: [], teams: [] };
    listManagementOptions.mockResolvedValue(options);
    await expect(optionsHandler({} as never, { take: 100 })).resolves.toEqual({
      data: options,
    });
    expect(listManagementOptions).toHaveBeenCalledWith({ take: 100 });
  });
});
