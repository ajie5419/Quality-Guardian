import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useInspectionRequestInspectorOptions } from './useInspectionRequestInspectorOptions';

const { getInspectionInspectors } = vi.hoisted(() => ({
  getInspectionInspectors: vi.fn(),
}));

vi.mock('#/api/qms/inspection-request', () => ({ getInspectionInspectors }));

describe('useInspectionRequestInspectorOptions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads inspector options from the dedicated permission-gated endpoint', async () => {
    getInspectionInspectors.mockResolvedValue([]);
    const { loadInspectorOptions } = useInspectionRequestInspectorOptions();

    await loadInspectorOptions();

    expect(getInspectionInspectors).toHaveBeenCalledTimes(1);
  });

  it('maps inspector names with a username fallback', async () => {
    getInspectionInspectors.mockResolvedValue([
      { id: 'user-1', realName: 'Inspector A', username: 'inspector-a' },
      { id: 'user-2', realName: null, username: 'inspector-b' },
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
