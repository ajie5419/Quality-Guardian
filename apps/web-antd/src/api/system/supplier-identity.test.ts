import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createSupplierIdentityLinkApi,
  deleteSupplierIdentityLinkApi,
  getSupplierIdentityLinksApi,
  getSupplierIdentityManagementOptionsApi,
  updateSupplierIdentityLinkApi,
} from './supplier-identity';

const { deleteMock, get, post, put } = vi.hoisted(() => ({
  deleteMock: vi.fn(),
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
}));

vi.mock('#/api/request', () => ({
  requestClient: { delete: deleteMock, get, post, put },
}));

describe('supplier identity api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads the paginated mapping list', async () => {
    get.mockResolvedValue({ items: [], total: 0 });

    await expect(
      getSupplierIdentityLinksApi({ page: 2, pageSize: 20 }),
    ).resolves.toEqual({ items: [], total: 0 });
    expect(get).toHaveBeenCalledWith('/qms/supplier-identity-links', {
      params: { page: 2, pageSize: 20 },
    });
  });

  it('uses the identity link CRUD endpoints with canonical ids', async () => {
    const payload = { supplierId: 'supplier-1', teamId: 'team-1' };

    await createSupplierIdentityLinkApi(payload);
    await updateSupplierIdentityLinkApi('link-1', payload);
    await deleteSupplierIdentityLinkApi('link-1');

    expect(post).toHaveBeenCalledWith('/qms/supplier-identity-links', payload);
    expect(put).toHaveBeenCalledWith(
      '/qms/supplier-identity-links/link-1',
      payload,
    );
    expect(deleteMock).toHaveBeenCalledWith(
      '/qms/supplier-identity-links/link-1',
    );
  });

  it('loads management options from the admin-only identity endpoint', async () => {
    get.mockResolvedValue({ suppliers: [], teams: [] });

    await getSupplierIdentityManagementOptionsApi({ keyword: 'Supplier' });

    expect(get).toHaveBeenCalledWith('/qms/supplier-identity-links/options', {
      params: { keyword: 'Supplier' },
    });
  });
});
