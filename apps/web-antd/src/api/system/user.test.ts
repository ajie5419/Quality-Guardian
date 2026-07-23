import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getAllUsers } from './user';

const { get } = vi.hoisted(() => ({
  get: vi.fn(),
}));

vi.mock('#/api/request', () => ({
  requestClient: { get },
}));

describe('system user API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads every user page without exceeding the page-size limit', async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      id: `user-${index}`,
      username: `user-${index}`,
    }));
    get
      .mockResolvedValueOnce({ items: firstPage, total: 101 })
      .mockResolvedValueOnce({
        items: [{ id: 'user-100', username: 'user-100' }],
        total: 101,
      });

    const result = await getAllUsers({ roleName: 'QC', status: 1 });

    expect(result).toHaveLength(101);
    expect(get).toHaveBeenNthCalledWith(1, expect.any(String), {
      params: {
        page: 1,
        pageSize: 100,
        roleName: 'QC',
        status: 1,
      },
    });
    expect(get).toHaveBeenNthCalledWith(2, expect.any(String), {
      params: {
        page: 2,
        pageSize: 100,
        roleName: 'QC',
        status: 1,
      },
    });
  });

  it('stops when an inconsistent page is empty', async () => {
    get.mockResolvedValue({ items: [], total: 10 });

    await expect(getAllUsers()).resolves.toEqual([]);
    expect(get).toHaveBeenCalledTimes(1);
  });
});
