import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createPartMasterApi,
  deletePartMasterApi,
  getPartMasterListApi,
  getPartMasterOptionsApi,
  updatePartMasterApi,
} from './part-master';

const { deleteMock, get, post, put } = vi.hoisted(() => ({
  deleteMock: vi.fn(),
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
}));

vi.mock('#/api/request', () => ({
  requestClient: { delete: deleteMock, get, post, put },
}));

describe('part master api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads and normalizes the management list', async () => {
    get.mockResolvedValue({
      items: [{ id: 'part-1', name: 'Frame', sort: 1, status: 1 }],
      page: 2,
      pageSize: 20,
      total: 21,
    });

    await expect(
      getPartMasterListApi({
        keyword: 'Frame',
        page: 2,
        pageSize: 20,
        status: 1,
      }),
    ).resolves.toMatchObject({ total: 21 });
    expect(get).toHaveBeenCalledWith('/system/parts', {
      params: {
        keyword: 'Frame',
        page: 2,
        pageSize: 20,
        status: 1,
      },
    });
  });

  it('uses REST mutations for create, edit, and soft delete', async () => {
    await createPartMasterApi({ name: 'Frame', sort: 1 });
    await updatePartMasterApi('part-1', { status: 0 });
    await deletePartMasterApi('part-1');

    expect(post).toHaveBeenCalledWith('/system/parts', {
      name: 'Frame',
      sort: 1,
    });
    expect(put).toHaveBeenCalledWith('/system/parts/part-1', { status: 0 });
    expect(deleteMock).toHaveBeenCalledWith('/system/parts/part-1');
  });

  it('searches canonical options through the authenticated endpoint', async () => {
    get.mockResolvedValue([{ id: 'part-1', name: 'Frame' }]);

    await getPartMasterOptionsApi({ keyword: 'Frame', take: 20 });

    expect(get).toHaveBeenCalledWith('/qms/common/part-options', {
      params: { keyword: 'Frame', take: 20 },
    });
  });
});
