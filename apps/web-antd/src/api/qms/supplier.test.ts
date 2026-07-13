import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getSupplierInspectionHistory } from './supplier';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('#/api/request', () => ({
  requestClient: { get },
}));

describe('supplier inspection history api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads the server-selected inspection history source by supplier id', async () => {
    const response = { items: [], source: 'PROCESS', total: 0 } as const;
    get.mockResolvedValue(response);

    await expect(
      getSupplierInspectionHistory('supplier-1', { page: 2, pageSize: 10 }),
    ).resolves.toEqual(response);
    expect(get).toHaveBeenCalledWith(
      '/qms/supplier/supplier-1/inspection-history',
      { params: { page: 2, pageSize: 10 } },
    );
  });
});
