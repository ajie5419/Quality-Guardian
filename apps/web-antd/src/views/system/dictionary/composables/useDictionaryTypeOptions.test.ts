import { describe, expect, it, vi } from 'vitest';

import { useDictionaryTypeOptions } from './useDictionaryTypeOptions';

const mockGetDictionaryTypes = vi.fn();

vi.mock('#/api/system/dictionary', () => ({
  getDictionaryTypes: () => mockGetDictionaryTypes(),
}));

describe('useDictionaryTypeOptions', () => {
  it('loads options from backend types', async () => {
    mockGetDictionaryTypes.mockResolvedValueOnce([
      'supplier_status',
      'inspection_process_name',
    ]);
    const handleApiError = vi.fn();
    const { loadOptions, options, optionSet } =
      useDictionaryTypeOptions(handleApiError);

    await loadOptions();

    expect(handleApiError).not.toHaveBeenCalled();
    expect(options.value.map((item) => item.value)).toEqual([
      'supplier_status',
      'inspection_process_name',
    ]);
    expect(optionSet.value.has('supplier_status')).toBe(true);
  });

  it('falls back to shared default options when backend request fails', async () => {
    mockGetDictionaryTypes.mockRejectedValueOnce(new Error('network'));
    const handleApiError = vi.fn();
    const { loadOptions, options, optionSet } =
      useDictionaryTypeOptions(handleApiError);

    await loadOptions();

    expect(handleApiError).toHaveBeenCalledTimes(1);
    expect(options.value.length).toBeGreaterThan(0);
    expect(optionSet.value.has('supplier_status')).toBe(true);
    expect(optionSet.value.has('inspection_process_name')).toBe(false);
  });
});
