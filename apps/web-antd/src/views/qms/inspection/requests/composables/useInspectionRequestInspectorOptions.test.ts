import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useInspectionRequestInspectorOptions } from './useInspectionRequestInspectorOptions';

const { getAllUsers } = vi.hoisted(() => ({
  getAllUsers: vi.fn(),
}));

vi.mock('#/api/system/user', () => ({ getAllUsers }));

describe('useInspectionRequestInspectorOptions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads only active inspector-role users', async () => {
    getAllUsers.mockResolvedValue([]);
    const { loadInspectorOptions } = useInspectionRequestInspectorOptions();

    await loadInspectorOptions();

    expect(getAllUsers).toHaveBeenCalledWith({
      roleName: 'QC',
      status: 1,
    });
  });

  it('maps inspector names with a username fallback', async () => {
    getAllUsers.mockResolvedValue([
      { id: 'user-1', realName: 'Inspector A', username: 'inspector-a' },
      { id: 'user-2', realName: '', username: 'inspector-b' },
    ]);
    const { loadInspectorOptions, userOptions } =
      useInspectionRequestInspectorOptions();

    await loadInspectorOptions();

    expect(userOptions.value).toEqual([
      { label: 'Inspector A', value: 'user-1' },
      { label: 'inspector-b', value: 'user-2' },
    ]);
  });
});
