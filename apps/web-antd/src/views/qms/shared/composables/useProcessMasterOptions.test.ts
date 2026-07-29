import { describe, expect, it, vi } from 'vitest';

import { useProcessMasterOptions } from './useProcessMasterOptions';

const mockGetProcessMasterOptionsApi = vi.fn();

vi.mock('#/api/qms/process-master', () => ({
  getProcessMasterOptionsApi: () => mockGetProcessMasterOptionsApi(),
}));

describe('useProcessMasterOptions', () => {
  it('maps canonical process master options', async () => {
    mockGetProcessMasterOptionsApi.mockResolvedValueOnce([
      { dictKey: 'Welding', dictValue: 'Welding', id: 'p1', sort: 1 },
    ]);
    const { loadOptions, options } = useProcessMasterOptions({
      mapOptions: (items) =>
        (items ?? []).map((item) => ({
          label: item.dictValue,
          value: item.dictKey,
        })),
    });

    await loadOptions();

    expect(options.value).toEqual([{ label: 'Welding', value: 'Welding' }]);
  });

  it('does not restore hard-coded process options when loading fails', async () => {
    mockGetProcessMasterOptionsApi.mockRejectedValueOnce(new Error('network'));
    const { loadOptions, options } = useProcessMasterOptions({
      mapOptions: () => [{ label: 'Fallback', value: 'Fallback' }],
    });

    await loadOptions();

    expect(options.value).toEqual([]);
  });
});
