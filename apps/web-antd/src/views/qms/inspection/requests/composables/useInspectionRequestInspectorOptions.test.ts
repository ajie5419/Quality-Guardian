import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useInspectionRequestInspectorOptions } from './useInspectionRequestInspectorOptions';

const { getUserList } = vi.hoisted(() => ({
  getUserList: vi.fn(),
}));

vi.mock('#/api/system/user', () => ({ getUserList }));

describe('useInspectionRequestInspectorOptions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads only active inspector-role users', async () => {
    getUserList.mockResolvedValue({ items: [], total: 0 });
    const { loadInspectorOptions } = useInspectionRequestInspectorOptions();

    await loadInspectorOptions();

    expect(getUserList).toHaveBeenCalledWith({
      page: 1,
      pageSize: 100,
      roleName: 'QC',
      status: 1,
    });
  });

  it('maps inspector names with a username fallback', async () => {
    getUserList.mockResolvedValue({
      items: [
        { id: 'user-1', realName: 'Inspector A', username: 'inspector-a' },
        { id: 'user-2', realName: '', username: 'inspector-b' },
      ],
      total: 2,
    });
    const { loadInspectorOptions, userOptions } =
      useInspectionRequestInspectorOptions();

    await loadInspectorOptions();

    expect(userOptions.value).toEqual([
      { label: 'Inspector A', value: 'user-1' },
      { label: 'inspector-b', value: 'user-2' },
    ]);
  });
});
